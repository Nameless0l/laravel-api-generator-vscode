# Changelog

All notable changes to the Laravel API Generator VS Code extension will be documented in this file.

## [1.1.0] - 2026-09-28

A redesigned interface. Pairs with `nameless/laravel-api-generator` 4.0 and still works with 3.9 or later. Needs VS Code 1.82 or later.

### Added
- **A new sidebar home.** The project with its Laravel and PHP versions and the package state, with the Composer command that fixes it when needed; a **New API** button; the sources to generate from (a description, the database, a schema file, a Mermaid diagram, an OpenAPI spec); the project tools (entity diagram, migrations and tests, snippets, documentation).
- **One review screen for every source.** A description, a schema file, a Mermaid diagram, an OpenAPI spec and database tables open the package's dry run in a panel: each entity with its fields, relations and files, what will be created, updated or kept, the shared files, the options, then **Generate**. Kept files can be overwritten on purpose and their diffs opened.
- **Describe with Copilot in a panel.** Pick the chat model, include the existing entities or not, start from an example, read the proposed entities as cards that follow your edits of the YAML draft, then review the plan.
- **An API ready screen.** The files written, the routes registered, and the next steps run in place: migrations, tests (with Stop), seeding (confirmed by a second click), the Scramble docs and the stubs. **Project Actions** opens the same steps at any time.
- **Nullable, unique and default** on each field of the builder (package 3.9+).
- **Files edited by hand are flagged** in the entity tree, with a count on the entity (package 3.11+).

### Changed
- **The builder** previews the real files next to the form, with a diff for the modified ones. Its examples and imports (a database table, a class_data.json file, an OpenAPI spec) moved to two menus, and **Only some files** replaces the file checklist.
- **The entity diagram** reads the column types and foreign keys from the migrations, and gains a search (Ctrl+F), a minimap, an export to SVG or Mermaid, and an inspector with the fields, relations and files of the selected entity.
- The entities view keeps **New API**, **Diagram** and **Refresh** in its title bar; the sources and project tools moved to its `...` menu.

### Fixed
- The Copilot panel no longer waits forever when the model sends back nothing: it says so and suggests checking the Copilot sign-in. Provider errors are shown as plain text, with their own fix as a button (for example setting an API key).

## [1.0.0] - 2026-09-27

Pairs with `nameless/laravel-api-generator` 4.0 and still works with 3.9 or later.

### Added
- **The entity tree reads the generation manifest** (package 3.11+). Each entity lists the files the package recorded: the Store and Update requests, the enums, the migrations added with `--add-fields`. Entities generated before the manifest keep their conventional files, found next to it.
- **Laravel 10 and 11 install the 3.x line.** The package 4.x needs Laravel 12, so on older projects the install prompt says so and runs `composer require --dev "nameless/laravel-api-generator:^3.15"`.
- **Generation errors come with their code** (package 3.9+). Every generation asks for the package's JSON document: a file that cannot be written points to the folder permissions, a broken manifest opens it, and invalid schemas show the package's hint. The text patterns remain for older packages and for errors the package cannot classify, such as a database that refuses the connection.

### Changed
- **Go to Related File** knows the Store and Update requests, the enums named after their entity (`PostStatus`) and every file the manifest records, migrations included.
- **Regenerate File(s)** lists the paths the manifest recorded, and rewrites both requests with one item.
- Before a generation, the stub check says why a stub written for 3.x no longer fits, and warns about the stubs the package stopped reading.
- The fields of a Laravel 13 model are read from `#[Fillable([...])]`.
- The file nodes of the entity tree show the file name.
- The bundled Copilot skill follows the package 4.0.

## [0.17.0] - 2026-09-27

Works with `nameless/laravel-api-generator` 3.9 or later.

### Added
- **Describe an API with Copilot.** Write the API in plain words: the chat model VS Code offers (GitHub Copilot first, VS Code 1.90+) drafts an `api-schema.yaml` that relates to the entities your project already has. Review and edit the draft, then **Preview and Generate** shows the package's dry run before anything is written, or **Save as api-schema.yaml** keeps it as the source of your API. Also in the sidebar home and the entities view menu.

### Changed
- The OpenAPI import and this command share the same dry run dialog.

## [0.16.0] - 2026-09-27

Pairs with `nameless/laravel-api-generator` >= 3.13.

### Added
- **Generate APIs from an OpenAPI spec.** A new command, an entry in the sidebar home and the builder's **Import OpenAPI** button hand OpenAPI 3.0, 3.1 and Swagger 2.0 specs, JSON or YAML, to the package. A dry run first names the entities it found, counts the files to create and update, and lists the schemas left aside with the reason; **Generate** then writes them. A spec outside the project goes through stdin, so Sail and Docker work too.

### Changed
- With packages older than 3.13, **Import OpenAPI** keeps the previous JSON-only importer.
- The bundled Copilot skill knows the OpenAPI source.

## [0.15.0] - 2026-09-27

Pairs with `nameless/laravel-api-generator` >= 3.12 and `laravel/mcp`.

### Added
- **MCP server for Copilot.** In a Laravel project with `laravel/mcp` installed, the extension registers the package's MCP server (VS Code 1.101+), so Copilot's agent mode can list your generated entities, preview a generation, generate APIs and add fields by itself, without ever overwriting a file you edited. The server runs `php artisan api-generator:mcp` with your PHP command, Sail and Docker included, and the list refreshes when `vendor/composer/installed.json` or the PHP settings change. Set `laravelApiGenerator.mcp.enabled` to `false` to hide it.
- The bundled Copilot skill describes the MCP tools and the files kept after hand edits.

## [0.14.0] - 2026-09-27

Pairs with `nameless/laravel-api-generator` >= 3.11.

### Changed
- **Regenerating keeps your edits.** The package now leaves files edited by hand as they are. Before generating, a modal names them: **Overwrite** passes `--force`, **Keep my changes** generates everything else. Files the package would simply refresh no longer trigger a warning.
- The live preview marks those files with a **kept** badge, and **Show diff** still compares your version with the generated one.

## [0.13.0] - 2026-09-27

### Added
- **GitHub Copilot skill.** In Laravel projects, the extension contributes the package's `laravel-api-generator` agent skill (VS Code 1.109+), so Copilot generates APIs with `make:fullapi` instead of writing the files by hand.
- **Schema file validation.** `api-schema.yaml`, `api-schema.yml` and `api-schema.json` get completion and typo checks from the package's JSON Schema. YAML files need the Red Hat YAML extension.

## [0.12.0] - 2026-09-27

Pairs with `nameless/laravel-api-generator` >= 3.9 for the live preview. Older packages keep generating as before.

### Changed
- **The live preview is rendered by the installed package.** A PHP process (`php artisan api-generator:serve --stdio`) starts with the builder form and answers each preview in a few milliseconds, so the preview shows exactly the code the package writes: every file including routes, the database seeder, the policy, tests and enums, your published stubs, and badges for new, modified and unchanged files. Modified files open in a diff.
- Generation sends the form to `make:fullapi --schema=- --json`, the same input as the preview. No `class_data.json` is written at the project root anymore.
- The overwrite confirmation lists the files the package would actually modify.
- Options your installed package or Laravel version cannot honor are disabled with the reason, such as JSON:API before Laravel 12.45.

### Added
- `laravelApiGenerator.phpCommand` runs PHP through a full command, for projects whose PHP lives in Sail or Docker. When PHP is missing and the project ships Sail, the preview offers to switch in one click.
- The preview explains why it is unavailable (package not installed, too old, PHP not found, app failing to boot) and offers the fixing command.

### Fixed
- With relationships in the form, Soft Deletes, Auth and Postman were silently ignored. They now reach the generator.

### Removed
- The TypeScript copy of the stubs that used to render the preview.

## [0.11.1] - 2026-09-27

### Fixed
- The builder form now recognizes the "option does not exist" error returned by an older `nameless/laravel-api-generator` and offers the one-click `composer update nameless/laravel-api-generator -W`, as the import commands already did.

### Changed
- Artisan arguments are built in a single tested module. The test suite grows from 13 to 20 tests, now covering argument building and error diagnosis.

## [0.11.0] - 2026-07-21

### Added
- **Sidebar home** -- the activity bar view opens on a branded panel: a New API button, the three import sources (existing database, schema file, Mermaid diagram) and shortcuts to the entity diagram, the snippets picker and the documentation, localized like the rest of the UI. The entity tree keeps its place right below.
- **Infinite canvas** -- the entity diagram pans forever in every direction over an Obsidian-style dotted grid that tracks pan and zoom. Scroll pans, Shift+scroll pans horizontally, Ctrl+wheel (or a trackpad pinch) zooms toward the cursor, and dragging empty space pans with a hand cursor. Entity cards got a sharper look with cardinality badges and a relations section, and the view frames all entities on open.

### Fixed
- The diagram no longer collapses to minimum zoom when its webview starts without real dimensions; initial framing waits for the view to be measured.

## [0.10.2] - 2026-07-17

### Changed
- Cleaned up every user-facing string (webview labels, tooltips, walkthrough, README): consistent punctuation, no em-dashes.

## [0.10.1] - 2026-07-17

### Added
- Sponsor button on the Marketplace listing (`sponsor` field in the manifest), pointing at [GitHub Sponsors](https://github.com/sponsors/Nameless0l).

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
