# Sadkit Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2019-01-13
### Added
- Introduced JWT group-based authentication.
- "login" & "register" route types added.
- "auth.json" configuration file added.
### Changed
- Standard response Sadkit version now comes directly from package.json version number.
### Fixed
- Fixed NeDB "find" route response.

## [1.0.2] - 2019-01-12
### Added
- Added CHANGELOG.md

## [1.0.1] - 2019-01-12
### Fixed npm Version
- No Changes

## [1.0.0] - 2019-01-12
### Initial Public Release
- Web Server
- Hosts Support
- Multiple Ports Support
- Reverse Proxy Support
- SSL Support (SNI Callback) on both servers and proxies
- Aliases
- Redirects
- DBMS Support: NeDB & MongoDB
