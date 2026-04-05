# Changelog

All notable changes to the Laravel API Generator VS Code extension will be documented in this file.

## [0.2.0] - 2026-04-05

### Added
- **Loading spinners** on all action buttons (Generate, Migrate, Seed, Test, Routes, Open API Docs) so users see that an operation is running.
- **Smart server management** for Open API Docs -- auto-detects a running Laravel server on ports 8000-8003/8080, or starts `php artisan serve` automatically and detects the actual port.
- **JSON bulk import** -- import `class_data.json` to preview and generate multiple entities at once with visual entity cards.
- **Real-time code preview** -- live syntax-highlighted preview of generated code across all file types with tabbed navigation.
- **Entity existence check** -- warns when an entity already exists and files will be overwritten.
- **Marketplace icon** -- separate colored icon for VS Code Marketplace listing.

### Fixed
- **Activity bar icon** -- replaced colored SVG with monochrome `currentColor` icon for proper rendering in the VS Code activity bar.
- **Seed cancel** -- cancelling the Fresh + Seed confirmation dialog now properly clears the loading spinner.

## [0.1.0] - 2026-03-20

### Added
- Initial release.
- Visual entity builder with PascalCase validation.
- Dynamic fields with type selector.
- Options toggles (Auth/Sanctum, Postman, Soft Deletes).
- File preview before generation.
- Sidebar entity explorer with tree view.
- Quick actions (Migrate, Seed, Test, Routes, Docs).
- PHP snippets for Laravel API patterns.
- Entity diagram view.
- Go to Related File navigation (Alt+R).
