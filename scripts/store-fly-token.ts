import { prisma } from "../src/lib/prisma";
import { saveCredential } from "../src/lib/credentials";
import { readFileSync } from "fs";

async function main() {
  const token = readFileSync("/tmp/opencode/fly_token", "utf8").trim();
  const user = await prisma.user.findUnique({
    where: { email: "kishorelalith194@gmail.com" }
  });
  if (!user) {
    console.error("user not found");
    process.exit(1);
  }
  await saveCredential(user.id, "OAUTH_CLOUD_FLY", {
    accessToken: token,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
  });
  console.log("saved Fly credential for", user.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());