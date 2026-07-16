# Install the Composer package

The extension is a visual front-end for the
[`nameless/laravel-api-generator`](https://packagist.org/packages/nameless/laravel-api-generator)
package — that's what actually generates the code.

In your Laravel project, run:

```bash
composer require --dev nameless/laravel-api-generator
```

Version **3.5 or newer** unlocks all the features shown in this guide
(database import, schema files, Mermaid diagrams, Spatie QueryBuilder).

It is a **dev dependency**: it never runs in production, and the generated
code does not depend on it.

> 💡 If the package is missing when you run a command, the extension
> offers to install it for you in the integrated terminal.
