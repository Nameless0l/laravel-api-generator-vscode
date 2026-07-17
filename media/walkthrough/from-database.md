# Already have a database?

**Generate APIs from Database** introspects your existing schema and
builds the complete API layer for every table you select:

- Foreign keys become `belongsTo` / `hasMany` relationships
- Pivot tables become `belongsToMany` (no useless CRUD for them)
- `deleted_at` columns enable soft deletes automatically
- The `users` table is protected by default so your auth setup stays intact

You can also generate from declarative sources instead:

- **Schema file**: an `api-schema.yaml` / `.json` describing all entities
- **Mermaid diagram**: an `.mmd` ER or class diagram, straight from
  your documentation

All three commands live in the command palette under
**Laravel API Generator**, and in the `…` menu of the sidebar view.
