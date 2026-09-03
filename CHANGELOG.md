# Changelog

<a name="0.4.0"></a>
## 0.4.0 (2026-09-03)

### Added

- ✨ Attach a monospace HTML/RTF flavor to clipboard copies [[9dbf804](https://github.com/mathieutu/ovhtool/commit/9dbf80402d2d2d256ab1dd77e1ebce7394e5f476)]
- ✨ Add visual borders to the interactive table [[bc8f187](https://github.com/mathieutu/ovhtool/commit/bc8f187c8972d1d9874397f9a46f85496bd4498f)]
- ✨ Hide domain picker duplicates for accounts not pinned in domain→account cache [[14ee15e](https://github.com/mathieutu/ovhtool/commit/14ee15e46df57723276e1c8ccd51337d03efb904)]

### Fixed

- 🐛 Break table sort ties on later columns instead of API response order [[943ba1e](https://github.com/mathieutu/ovhtool/commit/943ba1ed6dba57321f9ec7bb3cdf54583f702ba5)]
- 🐛 Reconcile add/edit/delete against OVH&#x27;s lagging listing endpoints [[4f515f2](https://github.com/mathieutu/ovhtool/commit/4f515f2dc74d42d27c02e5ed71176442d06a92cc)]


<a name="0.3.0"></a>
## 0.3.0 (2026-09-03)

### Added

- ✨ Filter the home menu by typing, like every other list (ADR-0013) [[4c9b04f](https://github.com/mathieutu/ovhtool/commit/4c9b04ff59545e1cb1659432eefe6e25e468acf8)]

### Changed

- 🎨 Distinguish home menu colors from services, rename labels [[7a38c45](https://github.com/mathieutu/ovhtool/commit/7a38c45061de7ae4a67418299e7be65eecb3439b)]

### Fixed

- 🐛 Force the process to exit once Ink unmounts, and disable HTTP keep-alive [[b2ceab4](https://github.com/mathieutu/ovhtool/commit/b2ceab405be6602cbca81e4e2a428c0480602107)]


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
- 👷 Add CI workflow [[ecd3ab4](https://github.com/mathieutu/ovhtool/commit/ecd3ab426385b0d9b91c677aa50d9e97bcafaf06)]
- 📦 Prepare package.json for open-source publishing [[38a11a4](https://github.com/mathieutu/ovhtool/commit/38a11a46f4d137e3358fa06d2ce2ee22f221791d)]
- 📄 Add AGPL-3.0 license [[32a584a](https://github.com/mathieutu/ovhtool/commit/32a584ab3a92bfcbacb39d1f18dfcf655d50a783)]
- 📝 Document architecture decisions as ADRs [[479e3dd](https://github.com/mathieutu/ovhtool/commit/479e3dd1be05eb0975846634a5843b2304c30f2e)]
- 📝 Add README [[fee820d](https://github.com/mathieutu/ovhtool/commit/fee820dc4576017d68608574340ce59dc8e4414b)]


