import os
import yaml
import sys
from openapi_spec_validator import validate_spec
from openapi_spec_validator.exceptions import OpenAPIError

def main():
    # N-02 polish: resolve the spec relative to THIS file, not the CWD, so the
    # validator works from the repo root (`python api/validate_openapi.py` —
    # the CI invocation) and from api/ (`python validate_openapi.py`) alike.
    spec_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'openapi.yaml')
    try:
        with open(spec_path, 'r', encoding='utf-8') as f:
            spec = yaml.safe_load(f)
    except Exception as e:
        print(f"Error loading OpenAPI file ({spec_path}): {e}")
        sys.exit(1)

    try:
        validate_spec(spec)
        print("OpenAPI spec is valid.")
    except OpenAPIError as e:
        print("OpenAPI spec validation error:", e)
        sys.exit(1)

if __name__ == '__main__':
    main()
