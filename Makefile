# Open Harness — Makefile
# Override sandbox name: make shell SANDBOX_NAME=mycontainer
# Connect to a different running container: make shell portfolio-advisor
# Connect as a specific user: make shell some-container SHELL_USER=postgres

-include .devcontainer/.env

HARNESS_YAML      := harness.yaml
# Derived env from harness.yaml (gitignored; regenerated on every make invocation).
HARNESS_YAML_ENVFILE := $(shell [ -f $(HARNESS_YAML) ] && sh scripts/harness-config.sh env $(HARNESS_YAML) > .devcontainer/.harness.yaml.env && echo .devcontainer/.harness.yaml.env)
# Explicit --env-file flags: .devcontainer/.env first, YAML-derived file second
# (later-file wins in docker compose — YAML keys override .env keys).
ENV_FILES         := $(if $(wildcard .devcontainer/.env),--env-file .devcontainer/.env,) $(if $(HARNESS_YAML_ENVFILE),--env-file $(HARNESS_YAML_ENVFILE),)

# SANDBOX_NAME resolution: harness.yaml wins over .devcontainer/.env; fallback openharness.
# Command-line "make ... SANDBOX_NAME=x" overrides all assignments automatically.
SANDBOX_NAME_YAML := $(shell [ -f $(HARNESS_YAML) ] && sh scripts/harness-config.sh get sandbox.name $(HARNESS_YAML))
SANDBOX_NAME      := $(or $(SANDBOX_NAME_YAML),$(SANDBOX_NAME),openharness)

SHELL_USER        ?= sandbox
COMPOSE_BASE      := -f .devcontainer/docker-compose.yml
# Compose overlay ordering (last -f wins → later-registered beats earlier):
#   1. harness.yaml compose.overrides[] — tracked overlays
#   2. config.json composeOverrides[]   — user-local overlays (beat tracked)
# jq is only invoked when both jq and config.json are present.
HARNESS_YAML_OVERRIDES := $(shell [ -f $(HARNESS_YAML) ] && sh scripts/harness-config.sh compose-overrides $(HARNESS_YAML) | sed 's|^|-f |' | tr '\n' ' ')
COMPOSE_OVERRIDES := $(HARNESS_YAML_OVERRIDES) $(shell command -v jq >/dev/null 2>&1 && [ -f config.json ] && \
    jq -r '.composeOverrides[]?' config.json 2>/dev/null | sed 's|^|-f |' | tr '\n' ' ')
COMPOSE           := docker compose $(ENV_FILES) $(COMPOSE_BASE) $(COMPOSE_OVERRIDES)

SHELL_CONTAINER ?= $(SANDBOX_NAME)
ifeq ($(firstword $(MAKECMDGOALS)),shell)
  SHELL_POS_ARGS := $(wordlist 2,$(words $(MAKECMDGOALS)),$(MAKECMDGOALS))
  ifneq ($(SHELL_POS_ARGS),)
    SHELL_CONTAINER := $(firstword $(SHELL_POS_ARGS))
    $(foreach a,$(SHELL_POS_ARGS),$(eval $a:;@:))
  endif
endif

.DEFAULT_GOAL := help

.PHONY: sandbox shell destroy stop logs ps restart config help

sandbox: ## Provision and start the sandbox
	$(COMPOSE) up -d --build

shell: ## Connect to a running container (default: $(SANDBOX_NAME)). Usage: make shell [container] [SHELL_USER=user]
	docker exec -it -u $(SHELL_USER) $(SHELL_CONTAINER) zsh

destroy: ## Stop and remove the sandbox (volumes wiped)
	$(COMPOSE) down -v

stop: ## Stop the sandbox, preserving volumes for later restart
	$(COMPOSE) stop

logs: ## Tail compose logs
	$(COMPOSE) logs -f

ps: ## Show service status
	$(COMPOSE) ps

restart: ## Restart the service
	$(COMPOSE) restart

config: ## Print effective harness.yaml-derived env and resolved compose config
	@if [ -f $(HARNESS_YAML) ]; then \
		printf "==> Derived env from $(HARNESS_YAML):\n"; \
		cat .devcontainer/.harness.yaml.env; \
		printf "\n"; \
	else \
		printf "No $(HARNESS_YAML) found — no derived env.\n"; \
	fi
	$(COMPOSE) config

help: ## List available targets with descriptions
	@printf "Open Harness — Make targets:\n"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?##/ {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@printf "\nConfiguration wizards (run \033[36minside\033[0m the sandbox after \033[36mmake shell\033[0m):\n"
	@printf "  \033[36moh config slack\033[0m  Slack integration setup wizard\n"
	@printf "  \033[36moh --help\033[0m         List all \033[36moh\033[0m subcommands\n"
