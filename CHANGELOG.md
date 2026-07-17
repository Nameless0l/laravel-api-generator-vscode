# Changelog

All notable changes to the Laravel API Generator VS Code extension will be documented in this file.

## [0.10.0] - 2026-07-17

Pairs with `nameless/laravel-api-generator` >= 3.7.

### Added
- **JSON:API resources** -- a new "JSON:API resources" option (builder form and the source generators' option picker) passes `--json-api` to the package. Generated resources extend `Illuminate\Http\Resources\JsonApi\JsonApiResource` (Laravel 12.45+) with `$attributes` and `$relationships` lists. The live code preview renders the JSON:API shape when the option is on. On older Laravel the package falls back to a standard resource.

## [0.9.0] - 2026-07-16

### Added
- **Model autocomplete on relationships** -- the Target Model input now suggests the models present in `app/Models` (native datalist, refreshed after each generation).
- **Primary key designation** -- a `PK` checkbox on each field row marks it as the table's primary key (replaces the default `id`; only one can be checked). The package (>= 3.6) wires the model (`$primaryKey`, `$incrementing`, `$keyType`), the migration (`->primary()`, no `$table->id()`) and every incoming relation (FK name, column type, `references()`, `exists` rule). The live code preview reflects all of it.
- **Orphan route cleanup** -- when List Routes fails because a route file references a deleted controller (the `ReflectionException` that also breaks the official Laravel extension), the extension explains it and offers to run the package's new `api-generator:clean-routes`.
- **Diagram zoom & pan** -- the entity diagram behaves like an Obsidian canvas: Ctrl+wheel zooms toward the cursor, dragging the background pans, and the toolbar gains −/+/100%/Fit controls. Card dragging stays accurate at any zoom level.
- **Cancellable operations** -- buttons no longer spin forever: clicking a button while its operation runs kills the underlying artisan process and restores the UI.

### Changed
- The Reset button only appears once the form, preview or output has something to reset.
- The relationship inputs are now localized and self-explanatory: "Target model (e.g. Post)" and "relation name, e.g. posts (optional)" with a tooltip explaining it becomes the Eloquent method name.

## [0.8.0] - 2026-07-16

Pairs with `nameless/laravel-api-generator` >= 3.6.

### Added
- **Add Fields to Entity** command -- right-click an entity in the sidebar (or use the command palette) and type `excerpt:text,status:enum(draft,published)`: the package creates an incremental migration and patches the model, request, factory and resource in place via `make:fullapi --add-fields`. Offers to run the migration right away.
- **Pest tests toggle** -- new checkbox in the generator form and option in the three source commands (database / schema / Mermaid), passing `--pest` so generated tests use `it()` / `expect()` instead of PHPUnit classes.
- **Enum field type** -- pick `enum` in the field type selector and type the values (`draft,published`): the generated API gets a backed PHP enum class, the model cast, `Rule::enum()` validation and a faked factory value. The live code preview renders all of it.

## [0.7.1] - 2026-07-16

### Added
- **Spatie QueryBuilder dependency check** -- when the QueryBuilder option is used and `spatie/laravel-query-builder` is not in the project's composer.json, a notification offers a one-click `composer require` (the generated services need it at runtime). Applies to the generator form and the three source commands, in English and French.

### Changed
- **Entity diagram overhaul** -- relationship links are now smooth Bezier curves anchored to the nearest card edge (instead of straight lines always drawn right-to-left across cards), with arrowheads, cardinality labels in readable pills, and hover highlighting of a card's connections. Inverse declarations (Post hasMany Comment + Comment belongsTo Post) are merged into a single link, self-referential relations render as a small loop, and rows/columns now space themselves to the real card sizes so tall cards never overlap.

## [0.7.0] - 2026-07-15

Pairs with `nameless/laravel-api-generator` >= 3.5.

### Added
- **Generate APIs from Database** command -- multi-select tables (with `users` protected by default), pick options, and generate complete APIs for the whole schema in one shot via `make:fullapi --from-database`. Foreign keys, pivot tables and soft deletes are detected by the package.
- **Generate APIs from Schema File** command -- auto-detects `api-schema.yaml` / `.yml` / `.json` at the project root (or browse for one) and generates every entity via `make:fullapi --schema=`.
- **Generate APIs from Mermaid Diagram** command -- uses the active `.mmd` file or a picked one and generates via `make:fullapi --mermaid=`.
- **Spatie QueryBuilder toggle** -- new option checkbox in the generator form (and an option step in the three new commands) that passes `--query-builder` so index endpoints support `?filter[field]=value&sort=-created_at`.
- The three new commands are available from the command palette and the sidebar `...` menu, in English and French.
- **Old-package detection** -- when the installed Composer package predates 3.5, the extension explains it and offers to run `composer update nameless/laravel-api-generator`.
- **Welcome view** -- when no generated API exists yet, the sidebar now shows a getting-started panel with one-click actions (Generate, Import from Database, Schema File) instead of an empty tree.
- **Auto-refresh** -- a file watcher on `app/**/*.php` keeps the entity tree and status bar in sync when APIs are generated or deleted outside the extension (terminal, git pull...).
- **Monorepo support** -- Laravel projects living in a subfolder (e.g. `backend/`, `apps/api/`) are now detected up to two levels below the workspace root.
- **Release workflow** -- GitHub Action that builds the VSIX on every version tag and can publish to the VS Code Marketplace and Open VSX (when the VSCE_PAT / OVSX_PAT repository secrets are configured).
- **Getting Started walkthrough** -- a native VS Code walkthrough (Help > Get Started) covering package installation, the generator form, database import and the sidebar.
- **Unit tests + CI** -- 11 tests on the pure services (entity scanner, migration introspector) using Node's built-in test runner, run with the VSIX build on every push/PR.

### Changed
- **VSIX size cut from 24.5 MB to under 1 MB** -- demo GIFs are no longer bundled into the package (the marketplace page loads them from GitHub instead).
- **Go to Related keybinding** moved from `Alt+R` to `Ctrl+Alt+R` (`Cmd+Alt+R` on macOS) to avoid conflicts with other extensions.
- Removed the broken `lint` npm script (ESLint was never installed or configured).

### Fixed
- A generated `User` API now appears in the sidebar tree (it was unconditionally filtered out).

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
