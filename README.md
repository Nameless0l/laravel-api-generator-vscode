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
- **Dynamic fields** -- add/remove fields with name and type selector (string, integer, text, float, boolean, json, date, datetime, uuid, etc.)
- **Options toggles** -- Auth (Sanctum), Postman collection export, Soft Deletes
- **File preview** -- see what files will be generated before running
- **Real-time code preview** -- live preview of generated code across all file types (Model, Controller, Service, DTO, etc.) with syntax highlighting and tabbed navigation
- **Entity existence check** -- warns if the entity already exists and files will be overwritten

### JSON Bulk Import

Import a `class_data.json` file to generate multiple entities at once:

- Visual preview of all entities with their fields and relationships
- One-click generation for the entire schema
- Supports relationships (oneToMany, manyToOne, manyToMany, compositions, aggregations)
- [Download a sample class_data.json](https://github.com/Nameless0l/laravel-api-generator/blob/main/examples/class_data.json) to try it out (Blog with Author, Category, Article, Tag)

### Sidebar Entity Explorer

Browse all generated entities in a dedicated sidebar panel:

- Collapsible tree view per entity
- File status indicators (exists / missing)
- Click to open any generated file directly
- Right-click an entity to delete it (with confirmation)

### Quick Actions

Run common artisan commands directly from the extension with **loading spinners** so you always know when an action is running:

| Action | Description |
|--------|-------------|
| **Run Migrations** | `php artisan migrate` |
| **Fresh + Seed** | `php artisan migrate:fresh --seed` (with confirmation) |
| **Run Tests** | `php artisan test` |
| **List Routes** | `php artisan route:list --path=api` |
| **Open API Docs** | Auto-detects or starts server, then opens Scramble docs |

### Smart Server Management

The **Open API Docs** button intelligently handles the development server:

1. Scans common ports (8000-8003, 8080) to find a running server
2. If none found, starts `php artisan serve` automatically
3. Detects the actual port and opens the correct URL
4. Server process stops when the panel is closed

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
3. Enter an entity name (e.g. `Product`), add fields, choose options
4. Click **Generate API**

### 4. Try with the sample JSON

Download the [sample class_data.json](https://github.com/Nameless0l/laravel-api-generator/blob/main/examples/class_data.json) (Blog schema: Author, Category, Article, Tag), then:

1. Click **Import JSON** in the extension
2. Select the downloaded file
3. Preview the entities and click **Generate All from JSON**
4. Click **Run Migrations** then **Fresh + Seed**
5. Click **Open API Docs** to browse your new API

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
tests/Feature/ProductControllerTest.php         -- Full CRUD endpoint tests
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
