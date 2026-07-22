import { defineConfig } from "vite";

const flowPostRedirectMiddleware = () => ({
  name: "flow-post-redirect-middleware",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const urlPath = (req.url || "").split("?")[0];
      if (req.method === "POST" && (urlPath === "/pago-exitoso" || urlPath === "/")) {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => {
          const params = new URLSearchParams(body);
          const token = params.get("token");
          console.log("[VITE FLOW MIDDLEWARE] Recibida redirección POST de Flow con token:", token);
          if (token) {
            res.writeHead(303, { Location: `/pago-exitoso?token=${encodeURIComponent(token)}` });
            return res.end();
          }
          res.writeHead(303, { Location: `/pago-exitoso` });
          return res.end();
        });
        return;
      }
      next();
    });
  },
});

export default defineConfig({
  plugins: [flowPostRedirectMiddleware()],
  server: {
    port: 5173,
    open: true,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
