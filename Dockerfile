ARG PYTHON_VERSION=3.12

# --- 前端 Duck 面板（简体中文）---
FROM node:20-bookworm-slim AS dashboard
WORKDIR /dashboard
COPY app/dashboard/package.json app/dashboard/package-lock.json ./
RUN npm ci
COPY app/dashboard/ ./
RUN npm run build && cp build/index.html build/404.html

# --- Python 依赖 + Xray ---
FROM python:${PYTHON_VERSION}-slim AS build

ENV PYTHONUNBUFFERED=1
WORKDIR /code

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential curl unzip gcc python3-dev libpq-dev \
    && curl -fsSL https://github.com/Gozargah/Marzban-scripts/raw/master/install_latest_xray.sh | bash \
    && rm -rf /var/lib/apt/lists/*

COPY ./requirements.txt /code/
RUN python3 -m pip install --upgrade pip setuptools \
    && pip install --no-cache-dir --upgrade -r /code/requirements.txt

# --- 运行镜像 ---
FROM python:${PYTHON_VERSION}-slim
ARG PYTHON_VERSION=3.12

LABEL org.opencontainers.image.title="Duck Panel"
LABEL org.opencontainers.image.description="Duck proxy panel (Marzban fork)"

ENV PYTHON_LIB_PATH=/usr/local/lib/python3.12/site-packages
WORKDIR /code

RUN rm -rf "${PYTHON_LIB_PATH}"/*

COPY --from=build $PYTHON_LIB_PATH $PYTHON_LIB_PATH
COPY --from=build /usr/local/bin /usr/local/bin
COPY --from=build /usr/local/share/xray /usr/local/share/xray

RUN pip install --no-cache-dir 'setuptools>=69.0.0' \
    && python -c "import apscheduler; print('Duck image deps OK')"

COPY . /code
COPY --from=dashboard /dashboard/build /code/app/dashboard/build

RUN ln -sf /code/marzban-cli.py /usr/bin/marzban-cli \
    && chmod +x /usr/bin/marzban-cli \
    && marzban-cli completion install --shell bash 2>/dev/null || true

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
