# Laravel API Generator - VS Code Extension

[![VS Code Version](https://img.shields.io/badge/VS%20Code-1.80+-blue.svg)](https://code.visualstudio.com/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Visual interface for the [nameless/laravel-api-generator](https://github.com/Nameless0l/laravel-api-generator) package. Generate complete REST APIs for Laravel without touching the terminal.

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
- Supports UML-style relationships (oneToMany, manyToOne, manyToMany, compositions, aggregations)

### Sidebar Entity Explorer

Browse all generated entities in a dedicated sidebar panel:

- Collapsible tree view per entity
- File status indicators (exists / missing)
- Click to open any generated file directly
- Right-click an entity to delete it (with confirmation)

### Quick Actions

Run common artisan commands directly from the extension with **loading spinners** so you always know when an action is running:

| Action | Command | Description |
|--------|---------|-------------|
| **Run Migrations** | `php artisan migrate` | Run pending migrations |
| **Fresh + Seed** | `php artisan migrate:fresh --seed` | Drop all tables, re-migrate and seed (with confirmation dialog) |
| **Run Tests** | `php artisan test` | Run the full test suite |
| **List Routes** | `php artisan route:list --path=api` | Display all registered API routes |
| **Open API Docs** | Auto-detected | Detects running server or starts `php artisan serve`, then opens Scramble docs |

### Smart Server Management

The **Open API Docs** button intelligently handles the development server:

1. Scans common ports (8000-8003, 8080) to find an already running Laravel server
2. If no server is found, automatically starts `php artisan serve`
3. Detects the actual port from the server output
4. Opens the correct URL (`http://127.0.0.1:{port}/docs/api`)
5. Server process is automatically stopped when the extension panel is closed

### What Gets Generated

One click generates **12 production-ready files**:

```
app/Models/Product.php
app/Http/Controllers/ProductController.php
app/Services/ProductService.php
app/DTO/ProductDTO.php
app/Http/Requests/ProductRequest.php
app/Http/Resources/ProductResource.php
app/Policies/ProductPolicy.php
database/migrations/xxxx_create_products_table.php
database/factories/ProductFactory.php
database/seeders/ProductSeeder.php
tests/Feature/ProductControllerTest.php
tests/Unit/ProductServiceTest.php
```

Plus: API route registration in `routes/api.php`, seeder registration in `DatabaseSeeder.php`.

---

## Requirements

- **VS Code** 1.80+
- **PHP** 8.1+ on your PATH (or configure `laravelApiGenerator.phpPath`)
- A **Laravel 10/11/12** project
- The package installed:
  ```bash
  composer require nameless/laravel-api-generator
  ```

---

## Installation

### From Source (Development)

```bash
git clone https://github.com/Nameless0l/laravel-api-generator-vscode.git
cd laravel-api-generator-vscode
npm install
npm run compile
```

Then in VS Code:
1. Open the `laravel-api-generator-vscode` folder
2. Press `F5` to launch the Extension Development Host
3. In the new window, open your Laravel project

### Package as VSIX

```bash
npm run package
```

Then install the `.vsix` file: `Extensions > ... > Install from VSIX`

---

## Usage

1. **Open a Laravel project** in VS Code (must have `artisan` and the package installed)
2. **Click the icon** in the activity bar (left sidebar) or run `Ctrl+Shift+P` > "Laravel API Generator: Generate Full API"
3. **Fill the form**: entity name, fields, options
4. **Click "Preview Files"** to see what will be created
5. **Click "Generate API"** to run the generation -- a spinner shows while generating
6. Use **Quick Actions** to migrate, seed, test, or view routes
7. Click **Open API Docs** to auto-start the server and browse interactive Swagger documentation

---

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `laravelApiGenerator.phpPath` | `php` | Path to the PHP executable |

---

## Related

- [nameless/laravel-api-generator](https://github.com/Nameless0l/laravel-api-generator) -- The Laravel package (Packagist)
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
