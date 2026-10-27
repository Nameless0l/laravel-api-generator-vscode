# Import what you already have

**Generate APIs from Database** reads your existing schema and builds the
API layer for every table you select:

- Foreign keys become `belongsTo` and `hasMany` relationships
- Pivot tables become `belongsToMany`, with no CRUD of their own
- `deleted_at` columns turn soft deletes on
- The `users` table is left out by default, so your auth setup stays intact

The other sources work the same way:

- **Schema file**: an `api-schema.yaml` or `.json` describing every entity
- **Mermaid diagram**: an ER or class diagram from your documentation
- **OpenAPI spec**: the object schemas of an OpenAPI 3 or Swagger 2 document
- **A description**: Copilot drafts the schema from a few sentences

Each source opens a review screen with the entities, their fields and every
file with its diff. Nothing is written until you click **Generate**. The
sources live in the sidebar, in the command palette under
**Laravel API Generator**, and in the `…` menu of the entities view.
