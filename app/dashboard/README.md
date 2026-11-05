# Duck 面板

React + Vite，构建后由主控 FastAPI 静态托管（`/dashboard/`）。

```bash
npm ci
VITE_BASE_API=/api/ npm run build
```

产物在 `build/`，Docker 构建时会复制到镜像。路由为 Hash 路由：`#/`, `#/nodes`, `#/hosts`, `#/telegram`, `#/system`。
