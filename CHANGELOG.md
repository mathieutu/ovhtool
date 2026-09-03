# Changelog

<a name="0.2.0"></a>
## 0.2.0 (2026-09-03)

### Added

- ✨ Tolerate a redundant domain suffix in DNS/mail form fields [[7141cda](https://github.com/mathieutu/ovhtool/commit/7141cda4946b65275f46428a5a2da62a07a6641d)]
- ✨ Add a manual Ctrl+R refresh on every API-backed screen [[00d82b3](https://github.com/mathieutu/ovhtool/commit/00d82b339dc78163f8c10a23a5362fbf3004eb30)]

### Fixed

- 🐛 Reject a mistyped subcommand instead of silently pinning it as a domain [[cb8e038](https://github.com/mathieutu/ovhtool/commit/cb8e038ffade64c2abbd4dfb30d1c3c1fdf7c119)]
- 🐛 Reword OVH&#x27;s &quot;already being processed&quot; 409 into an actionable message [[c12965d](https://github.com/mathieutu/ovhtool/commit/c12965dfce5e3d1380448372430bc1593401a09a)]
- 🐛 Retry the read after a DNS/redirection mutation until it&#x27;s reflected [[e0b7da2](https://github.com/mathieutu/ovhtool/commit/e0b7da20bd0a7e473ae378ef76b1e8a68753c8d9)]
- 🐛 Fix background-revalidation &quot;jump&quot; on DNS/mail/redirection tables [[31e8ed1](https://github.com/mathieutu/ovhtool/commit/31e8ed1f6b4eab6a3f0aaaab8ad383fb8c2b344e)]


<a name="0.1.0"></a>
## 0.1.0 (2026-09-03)

### Added

- ✨ Add agent mode and CLI entry point [[6d8923a](https://github.com/mathieutu/ovhtool/commit/6d8923adf61ac6c4572dd674989c8a0490b49e68)]
- ✨ Add the Ink interactive layer [[c48855c](https://github.com/mathieutu/ovhtool/commit/c48855cd499f2b48a8e6c6e7171db2ebf08515a3)]
- ✨ Add DNS, mail and email-redirection commands [[4ee26ee](https://github.com/mathieutu/ovhtool/commit/4ee26ee0469e57fe048d15f5a1dda8899fbe7b5f)]
- ✨ Add core config, OVH client, account resolution and diff engine [[84990d5](https://github.com/mathieutu/ovhtool/commit/84990d52c3e006ef9b92f8fc531b717f8dd90049)]
- 🎉 Initial commit [[d63d5a8](https://github.com/mathieutu/ovhtool/commit/d63d5a8339294ed741c6d39c612edddce88682fa)]

### Miscellaneous

- 📝 Add contributing guide [[f811dce](https://github.com/mathieutu/ovhtool/commit/f811dcef85094fd1d94e6d29b4c89369b8d6d5c6)]
-  👷 Add CI workflow [[ecd3ab4](https://github.com/mathieutu/ovhtool/commit/ecd3ab426385b0d9b91c677aa50d9e97bcafaf06)]
- 📦 Prepare package.json for open-source publishing [[38a11a4](https://github.com/mathieutu/ovhtool/commit/38a11a46f4d137e3358fa06d2ce2ee22f221791d)]
- 📄 Add AGPL-3.0 license [[32a584a](https://github.com/mathieutu/ovhtool/commit/32a584ab3a92bfcbacb39d1f18dfcf655d50a783)]
- 📝 Document architecture decisions as ADRs [[479e3dd](https://github.com/mathieutu/ovhtool/commit/479e3dd1be05eb0975846634a5843b2304c30f2e)]
- 📝 Add README [[fee820d](https://github.com/mathieutu/ovhtool/commit/fee820dc4576017d68608574340ce59dc8e4414b)]


