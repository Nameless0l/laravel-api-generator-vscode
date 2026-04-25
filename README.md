# Laravel API Generator - VS Code Extension

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/Nameless0l.laravel-api-generator?label=Marketplace&color=blue)](https://marketplace.visualstudio.com/items?itemName=Nameless0l.laravel-api-generator)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/Nameless0l.laravel-api-generator)](https://marketplace.visualstudio.com/items?itemName=Nameless0l.laravel-api-generator)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Generate complete REST APIs for Laravel without touching the terminal. Visual interface for the [nameless/laravel-api-generator](https://packagist.org/packages/nameless/laravel-api-generator) package.

> **12 production-ready files per entity** -- Model, Controller, Service, DTO, Request, Resource, Policy, Migration, Factory, Seeder, Feature Test, Unit Test -- plus route & seeder registration. All in one click.

---

## Demo

### Single Entity Generation

![Single entity generation](docs/demo-single-entity.gif)

*Create an entity, preview the code in real-time, and generate 12 files instantly.*

### JSON Bulk Import

![JSON bulk import](docs/demo-json-import.gif)

*Import a class_data.json to generate multiple entities and their relationships at once.*

### Quick Actions & API Docs

![Quick actions](docs/demo-quick-actions.gif)

*Run migrations, seed the database, execute tests, and open Swagger docs -- all from VS Code.*

---

## Features

### Visual Entity Builder

Create API entities through a form instead of CLI flags:

- **Entity name** input with PascalCase validation and reserved name detection
- **Quick Start presets** -- one-click form fill for Blog Post, User Profile, E-commerce Product, Comment, Task, Article (with soft deletes)
- **Drag-and-drop fields** -- reorder fields with a hamburger handle, the live preview updates on drop
- **Dynamic fields** -- add/remove fields with name and type selector (string, integer, text, float, boolean, json, date, datetime, uuid, etc.)
- **Relationships section** -- add `belongsTo` / `hasMany` / `hasOne` / `belongsToMany` relations directly in the UI; generation routes through the package's JSON pipeline so you get full FK support, foreign-keyed factories and tests
- **Options toggles** -- Auth (Sanctum), Postman collection export, Soft Deletes
- **File preview** -- see what files will be generated before running
- **Real-time code preview** -- live preview of generated code across all file types (Model, Controller, Service, DTO, etc.) with syntax highlighting and tabbed navigation
- **Conflict warning** -- before regenerating an existing entity, a modal lists every file that will be overwritten so you can opt out
- **Auto-open generated files** -- after a successful generation, the new Model and Controller open in the editor

### Import from Existing Database

The killer feature for legacy projects: scaffold a complete REST API on top of an existing database schema.

- Click **Import from Database**
- The extension lists every user table (system tables like `migrations`, `sessions`, `personal_access_tokens` are filtered out)
- Pick a table; columns are read with `Schema::getColumnType()` and mapped to the generator's vocabulary (`string`, `integer`, `boolean`, `json`, ...)
- The form is auto-filled with the entity name (singularized + PascalCased), the field list, and the Soft Deletes flag (when `deleted_at` is present)
- Review and click **Generate API**

### OpenAPI / Swagger Import

Import an OpenAPI 3.0 or Swagger 2.0 JSON spec to bulk-generate entities:

- Walks `components.schemas` (or `definitions`) and converts each schema into an entity
- Maps OpenAPI types and formats: `integer`/`int64`, `number`/`float`, `string`/`uuid`/`date`/`date-time`, `boolean`, `array`, `object`
- `$ref` properties become `belongsTo` relationships, `array` of `$ref` becomes `hasMany`
- Boilerplate schemas like `ErrorResponse`, `PaginatedResponse`, `Meta`, `Links` are skipped automatically

### JSON Bulk Import

Import a `class_data.json` file to generate multiple entities at once:

- Visual preview of all entities with their fields and relationships
- One-click generation for the entire schema
- Supports relationships (oneToMany, manyToOne, manyToMany, compositions, aggregations)
- [Download a sample class_data.json](https://github.com/Nameless0l/laravel-api-generator/blob/main/examples/class_data.json) to try it out (Blog with Author, Category, Article, Tag)

### Regenerate Single File(s)

Modified your migration and want fresh tests without retyping the schema?

- Right-click an entity in the sidebar tree -> **Regenerate File(s)...**
- The extension parses the existing migration to recover the field list and Soft Deletes flag
- Multi-select the artifacts to rebuild (Model, Controller, Service, DTO, Request, Resource, Factory, Seeder, Policy, Feature Test, Unit Test)
- Underlying call is `make:fullapi --only=Type,Type` so the migration, the API route and seeder registration are left untouched

### Sidebar Entity Explorer

Browse all generated entities in a dedicated sidebar panel:

- Each entity expands into three groups: **Files**, **Fields**, **Relations**
- **Files** show a green check / red slash for each artifact (Model, Controller, Service, ...) and click to open
- **Fields** are read from the model's `$fillable`
- **Relations** are extracted from the model's `belongsTo` / `hasMany` / `hasOne` / `belongsToMany` methods, with a `belongsTo -> Author` style description
- Inline actions on each entity: **Regenerate File(s)** and **Delete**

### Quick Actions

Run common artisan commands directly from the extension with **loading spinners** so you always know when an action is running:

| Action | Description |
|--------|-------------|
| **Run Migrations** | `php artisan migrate` (auto-creates `.env` from `.env.example` if missing) |
| **Fresh + Seed** | `php artisan migrate:fresh --seed` (with confirmation, same `.env` check) |
| **Run Tests** | `php artisan test` |
| **List Routes** | `php artisan route:list --path=api` |
| **Open API Docs** | Auto-detects or starts server, then opens Scramble docs |
| **Customize Stubs** | Smart action: publishes the package's stubs the first time, then offers Open Folder / Reset to Defaults / Cancel on subsequent clicks |

### Stub Validation Guard

When you customize stubs (`stubs/vendor/laravel-api-generator/...`), the extension calls `api-generator:validate-stubs` before each generation. If a customized stub is missing a required `{{placeholder}}`, you get a modal listing the offending stubs and three actions: **Open Stubs Folder**, **Generate Anyway**, or close.

### Smart Dependency Detection

The extension never lets a missing package silently break the flow:

- Open a Laravel project where `nameless/laravel-api-generator` is missing -> a notification offers **Install via Composer**
- Click **Open API Docs** without `dedoc/scramble` -> prompted to install
- Check the **Auth (Sanctum)** option without `laravel/sanctum` -> prompted to install or generate without auth

### Smart Server Management

The **Open API Docs** button intelligently handles the development server:

1. Scans common ports (8000-8003, 8080) to find a running server
2. If none found, starts `php artisan serve` automatically
3. Detects the actual port and opens the correct URL
4. Server process stops when the panel is closed

### French / English UI (i18n)

The whole UI -- panel labels, popups, QuickPick prompts, error messages -- is available in **English and French**. Language follows VS Code's display language by default; can be forced via the `laravelApiGenerator.locale` setting (`auto` / `en` / `fr`).

---

## Quick Start

### 1. Install the package

```bash
composer require nameless/laravel-api-generator
```

### 2. Install the extension

Search **"Laravel API Generator"** in VS Code Extensions (`Ctrl+Shift+X`), or install from [Marketplace](https://marketplace.visualstudio.com/items?itemName=Nameless0l.laravel-api-generator).

### 3. Generate your first API

1. Open your Laravel project in VS Code
2. Click the **Laravel API Generator** icon in the activity bar
3. Either pick a preset, import from your database / OpenAPI / JSON, or fill the form manually
4. Click **Generate API**

### 4. Customize the generated code

Want a different controller layout, different test asserts, more fields in the resource? Click **Customize Stubs** in Quick Actions, edit the files in `stubs/vendor/laravel-api-generator/`, and regenerate. Your stubs are validated before every generation.

---

## What Gets Generated

```
app/Models/Product.php                          -- Eloquent model with fillable, casts, relationships
app/Http/Controllers/ProductController.php      -- CRUD controller with service injection
app/Services/ProductService.php                 -- Business logic with filtering
app/DTO/ProductDTO.php                          -- Readonly data transfer object
app/Http/Requests/ProductRequest.php            -- Form validation rules
app/Http/Resources/ProductResource.php          -- API resource transformer
app/Policies/ProductPolicy.php                  -- Authorization policy
database/migrations/xxxx_create_products_table.php
database/factories/ProductFactory.php           -- Faker-based factory
database/seeders/ProductSeeder.php              -- Seeds 10 records
tests/Feature/ProductControllerTest.php         -- Full CRUD endpoint tests (with actingAs when --auth)
tests/Unit/ProductServiceTest.php               -- Service layer tests
routes/api.php                                  -- Route::apiResource auto-registered
database/seeders/DatabaseSeeder.php             -- Seeder auto-registered
```

---

## Requirements

- **VS Code** 1.80+
- **PHP** 8.2+ on your PATH (or configure `laravelApiGenerator.phpPath`)
- A **Laravel 10/11/12** project
- The package: `composer require nameless/laravel-api-generator`

---

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `laravelApiGenerator.phpPath` | `php` | Path to the PHP executable |
| `laravelApiGenerator.locale` | `auto` | UI language: `auto` (follow VS Code), `en`, or `fr` |

---

## Related

- [nameless/laravel-api-generator](https://github.com/Nameless0l/laravel-api-generator) -- The Laravel package (Packagist)
- [Sample class_data.json](https://github.com/Nameless0l/laravel-api-generator/blob/main/examples/class_data.json) -- Example Blog schema to test with
- [Scramble](https://github.com/dedoc/scramble) -- Auto-generated API documentation (Swagger)

---

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes
4. Push and open a Pull Request

---

## License

MIT
