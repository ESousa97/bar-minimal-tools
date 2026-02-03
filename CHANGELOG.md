# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial project baseline

### Changed

- Weather widget now uses Open-Meteo API (free, no API key required)
- Weather widget disabled by default (user can enable in settings)
- Improved IP geolocation using ipinfo.io (more reliable)
- Removed CPU temperature display (Windows thermal zone not accurate for CPU)

### Fixed

- Fixed Clippy warnings (range patterns, no-effect replace)

### Removed

- Removed OpenWeather API dependency (was failing with 401 errors)
- Removed CPU temperature fields from backend and frontend
