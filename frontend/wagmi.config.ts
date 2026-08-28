import { defineConfig } from "@wagmi/cli";
import { foundry, react } from "@wagmi/cli/plugins";

export default defineConfig({
  out: "generated/contracts-generated.ts",
  plugins: [
    foundry({
      project: "../contract",
      artifacts: "out",
      forge: { build: false, rebuild: false },
      include: [
        "WafflesLaunchFactory.json",
        "WafflesBondingCurve.json",
        "WafflesMemeToken.json",
        "WafflesAmmFactory.json",
        "WafflesAmmPair.json",
        "WafflesAmmMigrator.json",
        "WafflesAmmRouter.json",
        "MockUSDC.json",
      ],
    }),
    react(),
  ],
});
