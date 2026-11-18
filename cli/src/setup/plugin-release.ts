export type ArchivePin={url:string;sha256:string;metadataUrl:string;metadataSha256:string};
export type PackageRelease={ref?:string;minimumHarnessVersion?:string;harness:'claude-code'|'codex'|'cursor'|'antigravity';name:string;path:string;version:string;capabilities:string;captureAvailable:boolean;daemonHandoff:boolean;files?:Record<string,{sha:string;bytes:number}>;archives?:Record<string,ArchivePin>};
export type PluginRelease={repository:string;ref:string;schemaVersion:1;bindingSchemaVersion:1;packages:PackageRelease[]};

// Reviewed immutable package inventory from the public plugins repository.
// Update this pin only with matching capability and native acceptance evidence.
export const pluginRelease:PluginRelease = {
  "repository": "getopencrawl/opencrawl-plugins",
  "ref": "68d68c4253827f6ff4992d7abdb045d317e0b9a6",
  "schemaVersion": 1,
  "bindingSchemaVersion": 1,
  "packages": [
    {
      "harness": "claude-code",
      "name": "opencrawl-local-claude-code",
      "path": "local/claude-code",
      "version": "0.1.2",
      "capabilities": "capabilities.json",
      "captureAvailable": true,
      "daemonHandoff": true,
      "minimumHarnessVersion": "2.1.327",
      "archives": {
        "linux-arm64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-claude-code-v0.1.2/opencrawl-local-claude-code-0.1.2-linux-arm64.zip",
          "sha256": "c8dd33c947409b15c86ddbdab70de39c03373692ad45f00bc6cbd36ab24b828e",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-claude-code-v0.1.2/opencrawl-local-claude-code-0.1.2-linux-arm64.json",
          "metadataSha256": "15a207ab598d61505d24ec1db4d043c13096f3b5a8f0b0dc33ce4cb164b0a2ae"
        },
        "linux-x64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-claude-code-v0.1.2/opencrawl-local-claude-code-0.1.2-linux-x64.zip",
          "sha256": "93d29a6550e60089202c611616dcc75842a88a11792f741a00262dbfbfc078e9",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-claude-code-v0.1.2/opencrawl-local-claude-code-0.1.2-linux-x64.json",
          "metadataSha256": "e89e317c4dfc704a66b25cf134bc7cb90348126e71a218d1c7e42390141c2de9"
        },
        "win32-x64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-claude-code-v0.1.2/opencrawl-local-claude-code-0.1.2-win32-x64.zip",
          "sha256": "ef1632b389a7068633dd3d8c509c711f716e3eb4795ecc5b3670062a6ba05641",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-claude-code-v0.1.2/opencrawl-local-claude-code-0.1.2-win32-x64.json",
          "metadataSha256": "4062cb12dbfaaeecf71313444eebeb8fcbb8adea104269f649d56dbe82f6eff7"
        },
        "darwin-arm64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-claude-code-v0.1.2/opencrawl-local-claude-code-0.1.2-darwin-arm64.zip",
          "sha256": "37881f9135eac0f23396ae0cfea2c00cca93171d60af1ae68cebbcc8cdd9afc0",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-claude-code-v0.1.2/opencrawl-local-claude-code-0.1.2-darwin-arm64.json",
          "metadataSha256": "f2ccd5bc5ea0ffa907462d665fe8438d76b4c28217ca9c9c4bb43dded49c924d"
        },
        "darwin-x64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-claude-code-v0.1.2/opencrawl-local-claude-code-0.1.2-darwin-x64.zip",
          "sha256": "9b7b85787934b56fc32147c6274815d7e7a63c60a7587f8d493dc5233b9ce1f4",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-claude-code-v0.1.2/opencrawl-local-claude-code-0.1.2-darwin-x64.json",
          "metadataSha256": "18e76c262e6551ce42cab56ad4207e3233afcd76ada78a115a41d5298bc1ebdf"
        }
      },
      "ref": "198ce92eaf40c3f74f71ac315f507f261d49c0b2"
    },
    {
      "harness": "codex",
      "name": "opencrawl-local-codex",
      "path": "local/codex",
      "version": "0.1.2",
      "capabilities": "capabilities.json",
      "captureAvailable": true,
      "daemonHandoff": true,
      "minimumHarnessVersion": "0.166.0",
      "archives": {
        "linux-arm64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-codex-v0.1.2/opencrawl-local-codex-0.1.2-linux-arm64.zip",
          "sha256": "b4c4d2f7201cb870997261393ed094e8f91ca7370ba479c84912ee35f70b445b",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-codex-v0.1.2/opencrawl-local-codex-0.1.2-linux-arm64.json",
          "metadataSha256": "1b513893baf85d364aac157ebd096d25690b275cfa41de6ce9ff957dd76ae849"
        },
        "linux-x64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-codex-v0.1.2/opencrawl-local-codex-0.1.2-linux-x64.zip",
          "sha256": "4af2184dd18a03aa63a726c50d69a02f8bb4b5b01fbd6464c1c8396dc8660f1e",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-codex-v0.1.2/opencrawl-local-codex-0.1.2-linux-x64.json",
          "metadataSha256": "b03fc284b10858f6bcbc5933b68563fc17dd2368a4319272caf81e6fa3154cce"
        },
        "win32-x64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-codex-v0.1.2/opencrawl-local-codex-0.1.2-win32-x64.zip",
          "sha256": "5c28f44a57d6419b8ba5e77540290aa8d9eb9ac3a252f0449ce6a018fb6a7f08",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-codex-v0.1.2/opencrawl-local-codex-0.1.2-win32-x64.json",
          "metadataSha256": "f8990173b86b2620de6492c4377b078c0e5f1442246e357201b77b632832f367"
        },
        "darwin-arm64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-codex-v0.1.2/opencrawl-local-codex-0.1.2-darwin-arm64.zip",
          "sha256": "ae5f9d40f00cc60fd489bff1b2b50973a2385d24a777d9434d1b9e17d80c7175",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-codex-v0.1.2/opencrawl-local-codex-0.1.2-darwin-arm64.json",
          "metadataSha256": "c08a5acc1a78269d7ad1614471d12ba43ee2d9ebfa59a7ff8091a1375a0391aa"
        },
        "darwin-x64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-codex-v0.1.2/opencrawl-local-codex-0.1.2-darwin-x64.zip",
          "sha256": "4689984e95dece4f2fb308ee5c2d5cfde295cb22d6ea8f6f90e7d6676ac76c04",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-codex-v0.1.2/opencrawl-local-codex-0.1.2-darwin-x64.json",
          "metadataSha256": "b7137a1aa53255dc4252a88c0418e87742c57175e9f9488e9921de58755ac11a"
        }
      },
      "ref": "b026dc51219d17a575fc043ce9d1d5dc7adc459b"
    },
    {
      "harness": "cursor",
      "name": "opencrawl-local-cursor",
      "path": "local/cursor",
      "version": "0.1.1",
      "capabilities": "capabilities.json",
      "captureAvailable": true,
      "daemonHandoff": true,
      "minimumHarnessVersion": "2026.11.17-f532c45",
      "archives": {
        "linux-arm64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-cursor-v0.1.1/opencrawl-local-cursor-0.1.1-linux-arm64.zip",
          "sha256": "9feb7b6c70e40468d9258cf0e31616b08d3d0fa096a802aa3024927536fa09da",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-cursor-v0.1.1/opencrawl-local-cursor-0.1.1-linux-arm64.json",
          "metadataSha256": "5a8a8a8abf5966d3ab7fde9086337842921520208bc78e7a07c0e922b8081d81"
        },
        "linux-x64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-cursor-v0.1.1/opencrawl-local-cursor-0.1.1-linux-x64.zip",
          "sha256": "e157b6f3241c6aa14b64b9c06dc5af41f286a1ad4d2a5fed80cf6e3b41f189e4",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-cursor-v0.1.1/opencrawl-local-cursor-0.1.1-linux-x64.json",
          "metadataSha256": "54062973e5424027b36a2039b5624fc5d89dd08fad92e0cff8aea6e6f8420395"
        },
        "win32-x64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-cursor-v0.1.1/opencrawl-local-cursor-0.1.1-win32-x64.zip",
          "sha256": "61071bc366810869a41bb78836c15843ce657710fc65e7c67477fb3b03475c4a",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-cursor-v0.1.1/opencrawl-local-cursor-0.1.1-win32-x64.json",
          "metadataSha256": "12fe6be9407e2c44b8d82844ad273b25867936e650b1450c4177811ad04172cb"
        },
        "darwin-arm64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-cursor-v0.1.1/opencrawl-local-cursor-0.1.1-darwin-arm64.zip",
          "sha256": "acf20337492d93facd2211dd6291d7ba3a8bc69cc3ce02f8b185dd194955ec3a",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-cursor-v0.1.1/opencrawl-local-cursor-0.1.1-darwin-arm64.json",
          "metadataSha256": "103c2c0f38155820725d26c63d0f30141b3a81f636a33eef2e85dcb42a878fdb"
        },
        "darwin-x64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-cursor-v0.1.1/opencrawl-local-cursor-0.1.1-darwin-x64.zip",
          "sha256": "78e6797fdce7ad5d587c4ad02c342a0c5015f1e88352b7f098f931ff63a56a5a",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-cursor-v0.1.1/opencrawl-local-cursor-0.1.1-darwin-x64.json",
          "metadataSha256": "c3e9276ac2c01ca342295fe50fb18cb9874867974238a7e0158042ee87978e1c"
        }
      },
      "ref": "da0200ec12aae076916765cbf264b67230ed3fca"
    },
    {
      "harness": "antigravity",
      "name": "opencrawl-local-antigravity",
      "path": "local/antigravity",
      "version": "0.1.1",
      "capabilities": "capabilities.json",
      "captureAvailable": true,
      "daemonHandoff": true,
      "minimumHarnessVersion": "1.5.9",
      "archives": {
        "linux-arm64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-antigravity-v0.1.1/opencrawl-local-antigravity-0.1.1-linux-arm64.zip",
          "sha256": "dec05f7bc241683372aadb7567e51f266c92736cce315b956c0b716b15b56bbe",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-antigravity-v0.1.1/opencrawl-local-antigravity-0.1.1-linux-arm64.json",
          "metadataSha256": "47211749d0c62e396ee6856b4cac1389a02a178420089e3b493bb2492518c652"
        },
        "linux-x64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-antigravity-v0.1.1/opencrawl-local-antigravity-0.1.1-linux-x64.zip",
          "sha256": "75654f075ebde4a8cf97f89964c68de8149caec2c4bbeab952256882f63e0822",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-antigravity-v0.1.1/opencrawl-local-antigravity-0.1.1-linux-x64.json",
          "metadataSha256": "429bd5bd306a61d02b4bc187d3d0ff82f9b9a0f98a20cd8ae10839a654629ee6"
        },
        "win32-x64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-antigravity-v0.1.1/opencrawl-local-antigravity-0.1.1-win32-x64.zip",
          "sha256": "50f34f8a2e994b39238e779e2eea266d828d0f8032ee361288694753372aa769",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-antigravity-v0.1.1/opencrawl-local-antigravity-0.1.1-win32-x64.json",
          "metadataSha256": "ca16c4d3a591a1e0aaf2d88f5d8962c934c6348ac7160dc3b2845c5d936c98e1"
        },
        "darwin-arm64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-antigravity-v0.1.1/opencrawl-local-antigravity-0.1.1-darwin-arm64.zip",
          "sha256": "f5731eab75873ae4af43a254798f821cf0acd9b99fad403308f25e3de7f0153f",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-antigravity-v0.1.1/opencrawl-local-antigravity-0.1.1-darwin-arm64.json",
          "metadataSha256": "4d64ac1d5cb32e66b63c2732486ec0c1b117396d8700fd47059e6f2fdaca904a"
        },
        "darwin-x64": {
          "url": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-antigravity-v0.1.1/opencrawl-local-antigravity-0.1.1-darwin-x64.zip",
          "sha256": "c1e07e23ee32023798de95c4f207a5ff5d3c750ab886d05b0fc6d83fe8550707",
          "metadataUrl": "https://github.com/getopencrawl/opencrawl-plugins/releases/download/local-antigravity-v0.1.1/opencrawl-local-antigravity-0.1.1-darwin-x64.json",
          "metadataSha256": "2bcbb141140fb5d18fcf68f1c2779bcbd597714a08f624e7514e3f4c0500e3d3"
        }
      },
      "ref": "452f81456766f43e96673442028be84df1bda58c"
    }
  ]
};
