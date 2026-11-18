export type ArchivePin={url:string;sha256:string;metadataUrl:string;metadataSha256:string};
export type PackageRelease={ref?:string;minimumHarnessVersion?:string;harness:'claude-code'|'codex'|'cursor'|'antigravity';name:string;path:string;version:string;capabilities:string;captureAvailable:boolean;daemonHandoff:boolean;files?:Record<string,{sha:string;bytes:number}>;archives?:Record<string,ArchivePin>};
export type PluginRelease={repository:string;ref:string;schemaVersion:1;bindingSchemaVersion:1;packages:PackageRelease[]};

// Reviewed immutable package inventory from the public plugins repository.
// Update this pin only with matching capability and native acceptance evidence.
export const pluginRelease:PluginRelease = {
  "repository": "getopencrawl/opencrawl-plugins",
  "ref": "6f90d72dd9ed80d35e963bc61bf3ac67e3c176d4",
  "schemaVersion": 1,
  "bindingSchemaVersion": 1,
  "packages": [
    {
      "harness": "claude-code",
      "name": "opencrawl-local-claude-code",
      "path": "local/claude-code",
      "version": "0.2.0",
      "capabilities": "capabilities.json",
      "captureAvailable": true,
      "daemonHandoff": true,
      "minimumHarnessVersion": "2.1.327",
      "archives": {
        "darwin-arm64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-claude-code-v0.2.0/opencrawl-local-claude-code-0.2.0-darwin-arm64.zip",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-claude-code-v0.2.0/opencrawl-local-claude-code-0.2.0-darwin-arm64.json",
          "sha256": "ba92895d184ea3cea09caee3eb2063d35e999ad1e0c547af5a8e168274a1c483",
          "metadataSha256": "c4976b75faaa38e41acaf7dc81aa543401cbfe6e00d48a37f7afdd9f2135659c"
        },
        "darwin-x64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-claude-code-v0.2.0/opencrawl-local-claude-code-0.2.0-darwin-x64.zip",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-claude-code-v0.2.0/opencrawl-local-claude-code-0.2.0-darwin-x64.json",
          "sha256": "b5a97add4644e57634590105e4f01fbabfbc40fa105bff60601b5818413944c3",
          "metadataSha256": "bf39124709e04725f0ceaf0db7cdea07967fba817bccd9667608267e4aa68a4b"
        },
        "linux-arm64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-claude-code-v0.2.0/opencrawl-local-claude-code-0.2.0-linux-arm64.zip",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-claude-code-v0.2.0/opencrawl-local-claude-code-0.2.0-linux-arm64.json",
          "sha256": "2ab267ee08b4c96abe80345daa8ea1d4beeddd07cc23877910874ac1f546e77a",
          "metadataSha256": "ae50b799831c59fe045240805f4ab2d90ec62631416ee520343e10c0c05fbb68"
        },
        "linux-x64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-claude-code-v0.2.0/opencrawl-local-claude-code-0.2.0-linux-x64.zip",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-claude-code-v0.2.0/opencrawl-local-claude-code-0.2.0-linux-x64.json",
          "sha256": "144251ef038fcf19e376c3f82528727cffde1e33ed23744ff57c1e4d6d6c8fc7",
          "metadataSha256": "1b7f9f6dafdd1598bcb46154ec27be4a3df871b0dff3be4a553caee9c14e7b5e"
        },
        "win32-x64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-claude-code-v0.2.0/opencrawl-local-claude-code-0.2.0-win32-x64.zip",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-claude-code-v0.2.0/opencrawl-local-claude-code-0.2.0-win32-x64.json",
          "sha256": "439b3d91f61799fda545a1f38651a0e86b768cc1aa08ee2c32cf8eb253290d8b",
          "metadataSha256": "c4fe2b1acdbf1bbbcfce1c909d32d0d89d6265b82b549b5b52476b248715be3b"
        }
      },
      "ref": "6f90d72dd9ed80d35e963bc61bf3ac67e3c176d4"
    },
    {
      "harness": "codex",
      "name": "opencrawl-local-codex",
      "path": "local/codex",
      "version": "0.2.0",
      "capabilities": "capabilities.json",
      "captureAvailable": true,
      "daemonHandoff": true,
      "minimumHarnessVersion": "0.166.0",
      "archives": {
        "darwin-arm64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-codex-v0.2.0/opencrawl-local-codex-0.2.0-darwin-arm64.zip",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-codex-v0.2.0/opencrawl-local-codex-0.2.0-darwin-arm64.json",
          "sha256": "b4c1ddca492db11543d46489367bf7afb230d668f874fe1857c7e64f1fbbe647",
          "metadataSha256": "f72b4bcde65c1ff9d8d51e0c2784101efcdb4175a684d9684f5d1441f213f87c"
        },
        "darwin-x64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-codex-v0.2.0/opencrawl-local-codex-0.2.0-darwin-x64.zip",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-codex-v0.2.0/opencrawl-local-codex-0.2.0-darwin-x64.json",
          "sha256": "e954f07dc81b618926d26dd15060b70ead21358172c93a244a6ddc437416345c",
          "metadataSha256": "fedc8172f033b75eec039d6d708c84f5452bd4f9ccd52b604a369c9328e2eb05"
        },
        "linux-arm64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-codex-v0.2.0/opencrawl-local-codex-0.2.0-linux-arm64.zip",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-codex-v0.2.0/opencrawl-local-codex-0.2.0-linux-arm64.json",
          "sha256": "1f5eef218aa25548b6a737633399f74c3ad63750073e9de58e492f598c317843",
          "metadataSha256": "a4fa60103e7096a126ee945d319d5f556517250740f9cbe2837f34c57bd9f7f5"
        },
        "linux-x64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-codex-v0.2.0/opencrawl-local-codex-0.2.0-linux-x64.zip",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-codex-v0.2.0/opencrawl-local-codex-0.2.0-linux-x64.json",
          "sha256": "9a91e3304ac50608dd8f39bd631a25f6b8eaeeccd6c1fe82376110f97238fca9",
          "metadataSha256": "072a4f26cb8fc221ab8678b23abb6e9aaa884d8b4b2f71f934c0c4b34e396a41"
        },
        "win32-x64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-codex-v0.2.0/opencrawl-local-codex-0.2.0-win32-x64.zip",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-codex-v0.2.0/opencrawl-local-codex-0.2.0-win32-x64.json",
          "sha256": "1cd5b1cfcc5a4bda0b0bedb9ff1e980483f78624259c4806238c504fb48ea0af",
          "metadataSha256": "f49ba1f0b9b03c3de8da590dccc8acb8d054163e5047fb3b9e81c4a9bb521431"
        }
      },
      "ref": "6f90d72dd9ed80d35e963bc61bf3ac67e3c176d4"
    },
    {
      "harness": "cursor",
      "name": "opencrawl-local-cursor",
      "path": "local/cursor",
      "version": "0.2.0",
      "capabilities": "capabilities.json",
      "captureAvailable": true,
      "daemonHandoff": true,
      "minimumHarnessVersion": "2026.11.17-f532c45",
      "archives": {
        "darwin-arm64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-cursor-v0.2.0/opencrawl-local-cursor-0.2.0-darwin-arm64.zip",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-cursor-v0.2.0/opencrawl-local-cursor-0.2.0-darwin-arm64.json",
          "sha256": "e040b86104b6c7cf1b9e6bbc81d3db611ad34878a60e43968780d705f7b91f1b",
          "metadataSha256": "447136169f90efb29f2306c1894401a389c85b1ed01b14578bdc26e5a4523921"
        },
        "darwin-x64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-cursor-v0.2.0/opencrawl-local-cursor-0.2.0-darwin-x64.zip",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-cursor-v0.2.0/opencrawl-local-cursor-0.2.0-darwin-x64.json",
          "sha256": "308a7ae014c1639c30834d0b8242ebb931183e2903ef8691a9a24f41e069cd95",
          "metadataSha256": "1cb6ae3f5f8d6afdf4b66c70fd3545274e601c09a8fd13c63d64ab3321f3a666"
        },
        "linux-arm64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-cursor-v0.2.0/opencrawl-local-cursor-0.2.0-linux-arm64.zip",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-cursor-v0.2.0/opencrawl-local-cursor-0.2.0-linux-arm64.json",
          "sha256": "81ed701ce7e80e7b49147c752509f5d2c1caa4dc1683ec1ac57ccfc8d250777a",
          "metadataSha256": "310041346f7006eee37a2fcef171de54a6177a6be2d9e590bdbf071269b1b1dc"
        },
        "linux-x64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-cursor-v0.2.0/opencrawl-local-cursor-0.2.0-linux-x64.zip",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-cursor-v0.2.0/opencrawl-local-cursor-0.2.0-linux-x64.json",
          "sha256": "da8c309dc7e07f6f9cc8ddc813a818a168574fe63ba49e54513f1e04ab6c3ffe",
          "metadataSha256": "1d8811ecf30567d3d4816087a3a0f4e8bed2bfdf9c7afd8ce712cc7c4925a275"
        },
        "win32-x64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-cursor-v0.2.0/opencrawl-local-cursor-0.2.0-win32-x64.zip",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-cursor-v0.2.0/opencrawl-local-cursor-0.2.0-win32-x64.json",
          "sha256": "f1b99d11fcf556367fd4c60441d439c29028e241c0c1c32aac1ba1a337892f65",
          "metadataSha256": "a755524e71b4f647e225fbb81ef8bd7f7daa9be6c6a6361a9743191cd3371164"
        }
      },
      "ref": "6f90d72dd9ed80d35e963bc61bf3ac67e3c176d4"
    },
    {
      "harness": "antigravity",
      "name": "opencrawl-local-antigravity",
      "path": "local/antigravity",
      "version": "0.2.0",
      "capabilities": "capabilities.json",
      "captureAvailable": true,
      "daemonHandoff": true,
      "minimumHarnessVersion": "1.5.9",
      "archives": {
        "darwin-arm64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-antigravity-v0.2.0/opencrawl-local-antigravity-0.2.0-darwin-arm64.zip",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-antigravity-v0.2.0/opencrawl-local-antigravity-0.2.0-darwin-arm64.json",
          "sha256": "f2cea888bcb10c71b2a68f41a5febe7668310408c537008e9fdc7a19fdb535c5",
          "metadataSha256": "0d65b81ae5307e9824d97b28f8f98a78038e27abb413246b972c931054aad72e"
        },
        "darwin-x64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-antigravity-v0.2.0/opencrawl-local-antigravity-0.2.0-darwin-x64.zip",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-antigravity-v0.2.0/opencrawl-local-antigravity-0.2.0-darwin-x64.json",
          "sha256": "e680148fc9b398f6963a0700dca4d17ec6cb6e2c0097eacb11c940e2357d7745",
          "metadataSha256": "d5f999f3ef80b40d67caf566424e3f8750cda4f5c2a02c556698fd915716d69b"
        },
        "linux-arm64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-antigravity-v0.2.0/opencrawl-local-antigravity-0.2.0-linux-arm64.zip",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-antigravity-v0.2.0/opencrawl-local-antigravity-0.2.0-linux-arm64.json",
          "sha256": "bae31c9ab3f2380c26cdfb66dbd3c5888e6f8f67aaffb17a71811b5e4ec01b58",
          "metadataSha256": "c818355e767628eef1fc42decd163784b0f82dbd14196d42d2018744263bfaed"
        },
        "linux-x64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-antigravity-v0.2.0/opencrawl-local-antigravity-0.2.0-linux-x64.zip",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-antigravity-v0.2.0/opencrawl-local-antigravity-0.2.0-linux-x64.json",
          "sha256": "ff93989084a8f9fbc0ab9a1fcb46b6a10e8ed99a4e0ebafd68c1e87c6f3834d9",
          "metadataSha256": "029eb4159f6958254b36149644f9c5f0a710306a0387e35c9b9142bef44489c6"
        },
        "win32-x64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-antigravity-v0.2.0/opencrawl-local-antigravity-0.2.0-win32-x64.zip",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-antigravity-v0.2.0/opencrawl-local-antigravity-0.2.0-win32-x64.json",
          "sha256": "8b2fc26592ee28b06a60d51ac257a8d5275c7966d97eeb610a875c9935bd91a6",
          "metadataSha256": "3eb4100219f8ad53a14e022423f1d4b2d7082d80a0a3a5199a56b29d80082e5e"
        }
      },
      "ref": "6f90d72dd9ed80d35e963bc61bf3ac67e3c176d4"
    }
  ]
};
