"""主控连接 Duck Node Agent（HTTP + Bearer，兼容原 REST 会话流程）。"""
from __future__ import annotations

import ssl
import threading
import time
from collections import deque
from contextlib import contextmanager

import grpc
import requests
from requests.adapters import HTTPAdapter

from app.xray.config import XRayConfig
from app.xray.node import NodeAPIError


def _prepare_config(config: XRayConfig) -> XRayConfig:
    for inbound in config.get("inbounds", []):
        stream_settings = inbound.get("streamSettings") or {}
        tls_settings = stream_settings.get("tlsSettings") or {}
        for certificate in tls_settings.get("certificates") or []:
            if certificate.get("certificateFile"):
                with open(certificate["certificateFile"], encoding="utf-8") as file:
                    certificate["certificate"] = [
                        line.strip() for line in file.readlines()
                    ]
                    del certificate["certificateFile"]
            if certificate.get("keyFile"):
                with open(certificate["keyFile"], encoding="utf-8") as file:
                    certificate["key"] = [line.strip() for line in file.readlines()]
                    del certificate["keyFile"]
    return config
from xray_api import XRay as XRayAPI


class DuckXRayNode:
    def __init__(
        self,
        address: str,
        port: int,
        api_port: int,
        api_secret: str,
        usage_coefficient: float = 1,
    ):
        self.address = address.strip("/")
        self.port = port
        self.api_port = api_port
        self.api_secret = api_secret
        self.usage_coefficient = usage_coefficient
        self.session = requests.Session()
        self._session_id = None
        self._rest_api_url = f"http://{self.address}:{self.port}"
        self._started = False
        self._api = None
        self._node_cert_pem = ""

    def _headers(self):
        return {"Authorization": f"Bearer {self.api_secret}"}

    def make_request(self, path: str, timeout: int, **params):
        try:
            res = self.session.post(
                self._rest_api_url + path,
                timeout=timeout,
                json={"session_id": self._session_id, **params},
                headers=self._headers(),
            )
            data = res.json() if res.content else {}
        except Exception as e:
            raise NodeAPIError(0, str(e)) from e
        if res.status_code == 200:
            return data
        detail = data.get("detail", res.text)
        raise NodeAPIError(res.status_code, detail)

    @property
    def connected(self):
        if not self._session_id:
            return False
        try:
            self.make_request("/ping", timeout=3)
            return True
        except NodeAPIError:
            return False

    @property
    def started(self):
        res = self.session.get(self._rest_api_url + "/", timeout=3, headers=self._headers())
        if res.status_code != 200:
            return False
        return res.json().get("started", False)

    @property
    def api(self):
        if not self._session_id:
            raise ConnectionError("Node is not connected")
        if not self._api:
            if not self.started:
                raise ConnectionError("Node is not started")
            self._api = XRayAPI(address=self.address, port=self.api_port)
        return self._api

    def connect(self):
        res = self.make_request("/connect", timeout=5)
        self._session_id = res["session_id"]

    def disconnect(self):
        if self._session_id:
            try:
                self.make_request("/disconnect", timeout=3)
            except NodeAPIError:
                pass
        self._session_id = None
        self._api = None

    def get_version(self):
        res = self.session.get(self._rest_api_url + "/", timeout=3, headers=self._headers())
        return res.json().get("core_version")

    def start(self, config: XRayConfig):
        if not self.connected:
            self.connect()
        config = _prepare_config(config)
        try:
            import json

            self.make_request(
                "/start", timeout=30, config=json.loads(config.to_json())
            )
        except NodeAPIError as exc:
            if exc.detail == "Xray is started already":
                return self.restart(config)
            raise
        self._started = True
        self._api = XRayAPI(address=self.address, port=self.api_port)
        try:
            grpc.channel_ready_future(self._api._channel).result(timeout=8)
        except grpc.FutureTimeoutError as e:
            raise ConnectionError("Failed to connect to node Xray API") from e

    def stop(self):
        if not self.connected:
            self.connect()
        self.make_request("/stop", timeout=10)
        self._api = None
        self._started = False

    def restart(self, config: XRayConfig):
        if not self.connected:
            self.connect()
        config = _prepare_config(config)
        import json

        self.make_request("/restart", timeout=30, config=json.loads(config.to_json()))
        self._started = True
        self._api = XRayAPI(address=self.address, port=self.api_port)
        try:
            grpc.channel_ready_future(self._api._channel).result(timeout=8)
        except grpc.FutureTimeoutError as e:
            raise ConnectionError("Failed to connect to node Xray API") from e

    @contextmanager
    def get_logs(self):
        yield deque(maxlen=100)
