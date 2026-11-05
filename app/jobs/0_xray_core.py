import time
import traceback

from app import app, logger, scheduler, xray
from app.xray.config import main_core_config
from app.db import GetDB, crud
from app.models.node import NodeStatus
from config import (
    JOB_CORE_HEALTH_CHECK_INTERVAL,
    NODE_HEALTH_FAILURES_BEFORE_RESTART,
    NODE_HEALTH_SYS_STATS_TIMEOUT,
)
from app.node_expiry import check_all_node_expiries
from xray_api import exc as xray_exc

_node_health_failures: dict[int, int] = {}


def core_health_check():
    config = None

    # main core
    if not xray.core.started:
        if not config:
            config = xray.config.include_db_users()
        xray.core.restart(main_core_config(config))

    # nodes' core
    for node_id, node in list(xray.nodes.items()):
        if node.connected:
            try:
                assert node.started
                node.api.get_sys_stats(timeout=NODE_HEALTH_SYS_STATS_TIMEOUT)
                _node_health_failures.pop(node_id, None)
            except (ConnectionError, xray_exc.XrayError, AssertionError):
                fails = _node_health_failures.get(node_id, 0) + 1
                _node_health_failures[node_id] = fails
                if fails >= max(1, NODE_HEALTH_FAILURES_BEFORE_RESTART):
                    _node_health_failures.pop(node_id, None)
                    if not config:
                        config = xray.config.include_db_users()
                    xray.operations.restart_node(node_id, config)

        if not node.connected:
            if xray.operations.node_connect_in_progress(node_id):
                continue
            if not config:
                config = xray.config.include_db_users()
            xray.operations.connect_node(node_id, config)


@app.on_event("startup")
def start_core():
    logger.info("Generating Xray core config")

    start_time = time.time()
    config = xray.config.include_db_users()
    logger.info(f"Xray core config generated in {(time.time() - start_time):.2f} seconds")

    # main core
    logger.info("Starting main Xray core")
    try:
        xray.core.start(main_core_config(config))
    except Exception:
        traceback.print_exc()

    # nodes' core
    logger.info("Starting nodes Xray core")
    with GetDB() as db:
        dbnodes = crud.get_nodes(db=db, enabled=True)
        node_ids = [dbnode.id for dbnode in dbnodes]
        for dbnode in dbnodes:
            crud.update_node_status(db, dbnode, NodeStatus.connecting)

    for node_id in node_ids:
        xray.operations.connect_node(node_id, config)

    from app.duck_node import inbound_tags_list, sync_node_hosts

    with GetDB() as db:
        for tag in xray.config.inbounds_by_tag:
            crud.get_or_create_inbound(db, tag)
        for dbnode in crud.get_nodes(db=db, enabled=True):
            tags = inbound_tags_list(dbnode)
            if tags:
                sync_node_hosts(db, dbnode)
    xray.hosts.update()

    scheduler.add_job(core_health_check, 'interval',
                      seconds=JOB_CORE_HEALTH_CHECK_INTERVAL,
                      coalesce=True, max_instances=1)
    scheduler.add_job(
        check_all_node_expiries,
        "interval",
        seconds=60,
        coalesce=True,
        max_instances=1,
    )


@app.on_event("shutdown")
def app_shutdown():
    logger.info("Stopping main Xray core")
    xray.core.stop()

    logger.info("Stopping nodes Xray core")
    for node in list(xray.nodes.values()):
        try:
            node.disconnect()
        except Exception:
            pass
