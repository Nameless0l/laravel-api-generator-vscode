# Install the Composer package

The extension drives the
[`nameless/laravel-api-generator`](https://packagist.org/packages/nameless/laravel-api-generator)
package, which writes the code.

Click **Install the package** in this step, in the sidebar or in the
entities view, or run it yourself in your Laravel project:

```bash
composer require --dev nameless/laravel-api-generator
```

Laravel 12 and 13 get the 4.x line. On Laravel 10 and 11, the extension
installs 3.15, which carries every generator fix released before 4.0.

It is a **dev dependency**: it never runs in production, and the generated
code does not depend on it. This step completes by itself once Composer
has installed the package.
