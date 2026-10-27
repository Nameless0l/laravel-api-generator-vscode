# Explore the sidebar

The **Generated Entities** view lists every API in your project with the
files the generator wrote:

- Click a file to open it. `Ctrl+Alt+R` (`Cmd+Alt+R` on macOS) jumps from
  a generated file to its siblings: model, controller, service, tests
- Files you edited by hand are flagged, and a regeneration keeps them
  unless you choose to overwrite them
- Hover an entity to **regenerate** some of its files or **delete** the
  whole API (files, routes and registrations). Regenerating opens the
  review screen first, with the diff of every file
- Right-click an entity to **add fields** with an incremental migration
- The **diagram** button draws your entities and their relationships

Once the project has entities, the **status bar** counts them, and
**Project Actions** run migrations, tests and seeders, and open the API
docs without leaving the editor.
