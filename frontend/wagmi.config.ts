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
        "LaunchFactory.json",
        "BondingCurve.json",
        "MemeToken.json",
        "MockUSDC.json",
        "AmmFactory.json",
        "AmmPair.json",
        "AmmMigrator.json",
        "AmmRouter.json",
      ],
    }),
    react(),
  ],
});
