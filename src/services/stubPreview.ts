import { EntityConfig } from "../types";

interface FieldMapping {
  phpType: string;
  validation: string;
  fake: string;
}

const TYPE_MAP: Record<string, FieldMapping> = {
  string: {
    phpType: "string",
    validation: "required|string|max:255",
    fake: "fake()->word()",
  },
  text: {
    phpType: "string",
    validation: "required|string",
    fake: "fake()->sentence()",
  },
  integer: {
    phpType: "int",
    validation: "required|integer",
    fake: "fake()->randomNumber()",
  },
  int: {
    phpType: "int",
    validation: "required|integer",
    fake: "fake()->randomNumber()",
  },
  bigint: {
    phpType: "int",
    validation: "required|integer",
    fake: "fake()->randomNumber()",
  },
  float: {
    phpType: "float",
    validation: "required|numeric",
    fake: "fake()->randomFloat(2, 1, 1000)",
  },
  decimal: {
    phpType: "float",
    validation: "required|numeric",
    fake: "fake()->randomFloat(2, 1, 1000)",
  },
  boolean: {
    phpType: "bool",
    validation: "required|boolean",
    fake: "fake()->boolean()",
  },
  bool: {
    phpType: "bool",
    validation: "required|boolean",
    fake: "fake()->boolean()",
  },
  json: {
    phpType: "array",
    validation: "required|json",
    fake: "json_encode(['key' => 'value'])",
  },
  date: {
    phpType: "string",
    validation: "required|date",
    fake: "fake()->dateTime()->format('Y-m-d H:i:s')",
  },
  datetime: {
    phpType: "string",
    validation: "required|date",
    fake: "fake()->dateTime()->format('Y-m-d H:i:s')",
  },
  timestamp: {
    phpType: "string",
    validation: "required|date",
    fake: "fake()->dateTime()->format('Y-m-d H:i:s')",
  },
  time: {
    phpType: "string",
    validation: "required|date",
    fake: "fake()->dateTime()->format('Y-m-d H:i:s')",
  },
  uuid: {
    phpType: "string",
    validation: "required|uuid",
    fake: "fake()->uuid()",
  },
};

const DB_TYPE_MAP: Record<string, string> = {
  string: "string",
  text: "text",
  integer: "integer",
  int: "integer",
  bigint: "bigInteger",
  float: "decimal",
  decimal: "decimal",
  boolean: "boolean",
  bool: "boolean",
  json: "json",
  date: "timestamp",
  datetime: "timestamp",
  timestamp: "timestamp",
  time: "timestamp",
  uuid: "uuid",
};

export class StubPreview {
  generatePreview(config: EntityConfig): Record<string, string> {
    const name = config.name;
    const lcName = name.charAt(0).toLowerCase() + name.slice(1);
    const tableName = this.pluralSnake(name);

    return {
      Model: this.genModel(name, config),
      Controller: this.genController(name, lcName),
      Service: this.genService(name, lcName),
      DTO: this.genDTO(name, config),
      Request: this.genRequest(name, config),
      Resource: this.genResource(name, config),
      Migration: this.genMigration(tableName, config),
      Factory: this.genFactory(name, config),
    };
  }

  private genModel(name: string, config: EntityConfig): string {
    const fillable = config.fields
      .map((f) => `        '${f.name}',`)
      .join("\n");
    const casts = config.fields
      .filter((f) =>
        [
          "boolean",
          "bool",
          "json",
          "integer",
          "int",
          "float",
          "decimal",
        ].includes(f.type),
      )
      .map((f) => {
        const cast = ["boolean", "bool"].includes(f.type)
          ? "boolean"
          : ["integer", "int"].includes(f.type)
            ? "integer"
            : ["float", "decimal"].includes(f.type)
              ? "float"
              : "array";
        return `        '${f.name}' => '${cast}',`;
      })
      .join("\n");

    let traits = "";
    let imports = "";
    if (config.options.softDeletes) {
      imports = "use Illuminate\\Database\\Eloquent\\SoftDeletes;\n";
      traits = "\n    use SoftDeletes;";
    }

    return `<?php

declare(strict_types=1);

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Factories\\HasFactory;
use Illuminate\\Database\\Eloquent\\Model;
${imports}
class ${name} extends Model
{
    use HasFactory;${traits}

    protected $fillable = [
${fillable}
    ];
${casts ? `\n    protected $casts = [\n${casts}\n    ];\n` : ""}}`;
  }

  private genController(name: string, lcName: string): string {
    return `<?php

declare(strict_types=1);

namespace App\\Http\\Controllers;

use App\\Models\\${name};
use App\\Services\\${name}Service;
use App\\DTO\\${name}DTO;
use App\\Http\\Requests\\${name}Request;
use App\\Http\\Resources\\${name}Resource;
use Illuminate\\Http\\Request;

class ${name}Controller extends Controller
{
    public function __construct(
        private readonly ${name}Service $service
    ) {}

    public function index(Request $request)
    {
        $items = $this->service->getAll($request->query());
        return ${name}Resource::collection($items);
    }

    public function store(${name}Request $request)
    {
        $dto = ${name}DTO::fromRequest($request);
        $item = $this->service->create($dto);
        return new ${name}Resource($item);
    }

    public function show(${name} $${lcName})
    {
        return new ${name}Resource($${lcName});
    }

    public function update(${name}Request $request, ${name} $${lcName})
    {
        $dto = ${name}DTO::fromRequest($request);
        $updated = $this->service->update($${lcName}, $dto);
        return new ${name}Resource($updated);
    }

    public function destroy(${name} $${lcName})
    {
        $this->service->delete($${lcName});
        return response(null, 204);
    }
}`;
  }

  private genService(name: string, lcName: string): string {
    return `<?php

declare(strict_types=1);

namespace App\\Services;

use App\\Models\\${name};
use App\\DTO\\${name}DTO;
use Illuminate\\Support\\Collection;

class ${name}Service
{
    public function getAll(array $filters = []): Collection
    {
        $query = ${name}::query();
        foreach ($filters as $field => $value) {
            if (in_array($field, (new ${name}())->getFillable(), true)) {
                $query->where($field, $value);
            }
        }
        return $query->get();
    }

    public function create(${name}DTO $dto): ${name}
    {
        return ${name}::create(get_object_vars($dto));
    }

    public function find(int $id): ${name}
    {
        return ${name}::findOrFail($id);
    }

    public function update(${name} $${lcName}, ${name}DTO $dto): ${name}
    {
        $${lcName}->update(get_object_vars($dto));
        return $${lcName}->fresh();
    }

    public function delete(${name} $${lcName}): bool
    {
        return $${lcName}->delete();
    }
}`;
  }

  private genDTO(name: string, config: EntityConfig): string {
    const attrs = config.fields
      .map((f) => {
        const t = TYPE_MAP[f.type]?.phpType || "string";
        return `        public ?${t} $${f.name},`;
      })
      .join("\n");

    const fromReq = config.fields
      .map((f) => {
        return `            $request->input('${f.name}'),`;
      })
      .join("\n");

    return `<?php

declare(strict_types=1);

namespace App\\DTO;

use App\\Http\\Requests\\${name}Request;

readonly class ${name}DTO
{
    public function __construct(
${attrs}
    ) {}

    public static function fromRequest(${name}Request $request): self
    {
        return new self(
${fromReq}
        );
    }
}`;
  }

  private genRequest(name: string, config: EntityConfig): string {
    const rules = config.fields
      .map((f) => {
        const v = TYPE_MAP[f.type]?.validation || "required|string";
        return `            '${f.name}' => '${v}',`;
      })
      .join("\n");

    return `<?php

declare(strict_types=1);

namespace App\\Http\\Requests;

use Illuminate\\Foundation\\Http\\FormRequest;

class ${name}Request extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
${rules}
        ];
    }
}`;
  }

  private genResource(name: string, config: EntityConfig): string {
    const fields = config.fields
      .map((f) => `            '${f.name}' => $this->${f.name},`)
      .join("\n");

    return `<?php

declare(strict_types=1);

namespace App\\Http\\Resources;

use Illuminate\\Http\\Request;
use Illuminate\\Http\\Resources\\Json\\JsonResource;

class ${name}Resource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
${fields}
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}`;
  }

  private genMigration(tableName: string, config: EntityConfig): string {
    const fields = config.fields
      .map((f) => {
        const dbType = DB_TYPE_MAP[f.type] || "string";
        return `            $table->${dbType}('${f.name}');`;
      })
      .join("\n");

    const sd = config.options.softDeletes
      ? "\n            $table->softDeletes();"
      : "";

    return `<?php

use Illuminate\\Database\\Migrations\\Migration;
use Illuminate\\Database\\Schema\\Blueprint;
use Illuminate\\Support\\Facades\\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('${tableName}', function (Blueprint $table) {
            $table->id();
${fields}
            $table->timestamps();${sd}
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('${tableName}');
    }
};`;
  }

  private genFactory(name: string, config: EntityConfig): string {
    const fields = config.fields
      .map((f) => {
        const fake = TYPE_MAP[f.type]?.fake || "fake()->word()";
        return `            '${f.name}' => ${fake},`;
      })
      .join("\n");

    return `<?php

namespace Database\\Factories;

use App\\Models\\${name};
use Illuminate\\Database\\Eloquent\\Factories\\Factory;

class ${name}Factory extends Factory
{
    protected $model = ${name}::class;

    public function definition(): array
    {
        return [
${fields}
        ];
    }
}`;
  }

  private pluralSnake(name: string): string {
    const snake = name.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
    if (snake.endsWith("y")) {
      return snake.slice(0, -1) + "ies";
    }
    if (
      snake.endsWith("s") ||
      snake.endsWith("x") ||
      snake.endsWith("sh") ||
      snake.endsWith("ch")
    ) {
      return snake + "es";
    }
    return snake + "s";
  }
}
