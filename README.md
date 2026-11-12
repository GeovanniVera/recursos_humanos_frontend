# UtnRh

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.2.6.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Docker

The whole project builds into a static nginx image (multi-stage `Dockerfile`).

```bash
cp .env.example .env      # adjust APP_PORT and API_BASE_URL
docker compose up --build
docker compose down
```

Configuration lives in `.env` (never committed):

| Variable | Meaning |
| --- | --- |
| `APP_PORT` | Host port the container publishes (default `4200`). |
| `API_BASE_URL` | API origin compiled into the bundle. Requires a rebuild to change. |
| `IMAGE_TAG` | Tag of the locally built image. |

`API_BASE_URL` is a build argument, not a runtime one: Angular environments are
static, so `docker compose up --build` is required after changing it.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
