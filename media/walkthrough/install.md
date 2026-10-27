# Install the Composer package

The extension drives the
[`nameless/laravel-api-generator`](https://packagist.org/packages/nameless/laravel-api-generator)
package, which writes the code.

In your Laravel project, run:

```bash
composer require --dev nameless/laravel-api-generator
```

Laravel 12 and 13 get the 4.x line. On Laravel 10 and 11, the extension
offers the command for 3.15, which carries every generator fix released
before 4.0.

It is a **dev dependency**: it never runs in production, and the generated
code does not depend on it. If the package is missing when you run a
command, the extension offers to install it in the integrated terminal.
