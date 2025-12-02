import yaml
import sys
from openapi_spec_validator import validate_spec
from openapi_spec_validator.exceptions import OpenAPIError

def main():
    try:
        with open(r'api/openapi.yaml', 'r', encoding='utf-8') as f:
            spec = yaml.safe_load(f)
    except Exception as e:
        print(f"Error loading OpenAPI file: {e}")
        sys.exit(1)

    try:
        validate_spec(spec)
        print("OpenAPI spec is valid.")
    except OpenAPIError as e:
        print("OpenAPI spec validation error:", e)
        sys.exit(1)

if __name__ == '__main__':
    main()
