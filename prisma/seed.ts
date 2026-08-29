import { PrismaClient, LaunchEngine } from "@prisma/client";

const prisma = new PrismaClient();

const apps = [
  {
    title: "PDF Converter",
    slug: "pdf-converter",
    description:
      "Merge, split, compress and convert PDF files right in your browser. Files never leave your private cloud instance.",
    iconUrl: "https://cdn-icons-png.flaticon.com/512/337/337946.png",
    gitHubRepoUrl: "https://github.com/Lalithkishore1224/servelless-fly-apps",
    engineType: LaunchEngine.OAUTH_CLOUD_SHELL,
    targetPort: 8080
  },
  {
    title: "Image Resizer",
    slug: "image-resizer",
    description:
      "Resize, crop and convert images between PNG, JPEG and WebP with live previews.",
    iconUrl: "https://cdn-icons-png.flaticon.com/512/685/685644.png",
    gitHubRepoUrl: "https://github.com/Lalithkishore1224/servelless-fly-apps",
    engineType: LaunchEngine.OAUTH_CLOUD_SHELL,
    targetPort: 8080
  },
  {
    title: "CSV Parser",
    slug: "csv-parser",
    description:
      "Upload CSV files to validate, transform and export them to JSON or Excel-compatible formats.",
    iconUrl: "https://cdn-icons-png.flaticon.com/512/2906/2906274.png",
    gitHubRepoUrl: "https://github.com/Lalithkishore1224/servelless-fly-apps",
    engineType: LaunchEngine.OAUTH_CLOUD_SHELL,
    targetPort: 8080
  },
  {
    title: "Markdown Studio",
    slug: "markdown-studio",
    description:
      "A free Google Cloud Shell-backed markdown editor with live preview, exports and cloud-synced workspaces.",
    iconUrl: "https://cdn-icons-png.flaticon.com/512/733/733635.png",
    gitHubRepoUrl: "https://github.com/Lalithkishore1224/servelless-markdown-studio",
    engineType: LaunchEngine.OAUTH_CLOUD_SHELL,
    targetPort: 3000
  },
  {
    title: "Video Trimmer",
    slug: "video-trimmer",
    description:
      "Cut and trim video clips client-side and export them as MP4 without quality loss.",
    iconUrl: "https://cdn-icons-png.flaticon.com/512/3067/3067664.png",
    gitHubRepoUrl: "https://github.com/Lalithkishore1224/servelless-fly-apps",
    engineType: LaunchEngine.OAUTH_CLOUD_SHELL,
    targetPort: 3000
  },
  {
    title: "JSON Beautifier",
    slug: "json-beautifier",
    description:
      "Format, validate, minify and diff JSON documents with an easy-to-read tree view.",
    iconUrl: "https://cdn-icons-png.flaticon.com/512/2165/2165112.png",
    gitHubRepoUrl: "https://github.com/Lalithkishore1224/servelless-json-beautifier",
    engineType: LaunchEngine.GITHUB_CODESPACES,
    targetPort: 9000
  }
];

async function main() {
  for (const app of apps) {
    await prisma.appProduct.upsert({
      where: { slug: app.slug },
      update: app,
      create: app
    });
  }
  console.log(`Seeded ${apps.length} app products.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
