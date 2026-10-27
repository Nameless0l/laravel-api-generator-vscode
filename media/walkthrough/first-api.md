# Generate your first API

Open the generator and describe your entity:

1. **Entity name** in PascalCase, e.g. `Product`, `BlogPost`
2. **Fields** with their types and modifiers (nullable, unique, default, enum values)
3. **Relationships** to other entities (belongsTo, hasMany, hasOne, belongsToMany)
4. **Options**: Sanctum auth, Postman collection, soft deletes, Pest tests,
   Spatie QueryBuilder, JSON:API resources

The **live preview** shows every file the package would write, computed by
the package itself, before anything touches the disk. **Generate the API**
then writes the full stack:

Model · Migration · Controller · Service · DTO · Store and Update requests ·
Resource · Policy · Factory · Seeder · Tests · Routes
