import { defineConfig } from "vite";

// The shared legacy entry contains both tools. The standalone build keeps the
// sales-order component as the only mounted application entry point.
const integratedRender = "IntegratedBusinessTools, {}";

export default defineConfig({
  base: "/taiyo-hacchu-scan/",
  plugins: [
    {
      name: "sales-order-only-entry",
      enforce: "post",
      transform(code, id) {
        if (!/src[\\/]main\.jsx$/.test(id)) return null;
        const standalone = code.replace(integratedRender, "Ot,{}");
        if (standalone === code) {
          throw new Error("Could not isolate the sales-order entry point");
        }
        return { code: standalone, map: null };
      },
    },
  ],
});
