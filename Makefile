# Open Harness — Makefile
# Override sandbox name: make shell SANDBOX_NAME=mycontainer
# Connect to a different running container: make shell portfolio-advisor
# Connect as a specific user: make shell some-container SHELL_USER=postgres

-include .devcontainer/.env

HARNESS_YAML      := harness.yaml
HARNESS_TEMPLATE  := harness.yaml.example
COMPOSE           := .oh/scripts/docker-compose.sh

# SANDBOX_NAME resolution: harness.yaml wins over .devcontainer/.env; fallback openharness.
# Command-line "make ... SANDBOX_NAME=x" overrides all assignments automatically.
SANDBOX_NAME_YAML := $(shell [ -f $(HARNESS_YAML) ] && sh .oh/scripts/harness-config.sh get sandbox.name $(HARNESS_YAML))
SANDBOX_NAME      := $(or $(SANDBOX_NAME_YAML),$(SANDBOX_NAME),openharness)

SHELL_USER        ?= sandbox
SHELL_CONTAINER ?= $(SANDBOX_NAME)
ifeq ($(firstword $(MAKECMDGOALS)),shell)
  SHELL_POS_ARGS := $(wordlist 2,$(words $(MAKECMDGOALS)),$(MAKECMDGOALS))
  ifneq ($(SHELL_POS_ARGS),)
    SHELL_CONTAINER := $(firstword $(SHELL_POS_ARGS))
    $(foreach a,$(SHELL_POS_ARGS),$(eval $a:;@:))
  endif
endif

# `make gateway <pi|hermes>` — forward the backend as a positional word.
ifeq ($(firstword $(MAKECMDGOALS)),gateway)
  GATEWAY_ARGS := $(wordlist 2,$(words $(MAKECMDGOALS)),$(MAKECMDGOALS))
  $(foreach a,$(GATEWAY_ARGS),$(eval $a:;@:))
endif

.DEFAULT_GOAL := help

.PHONY: sandbox shell destroy stop logs ps restart config help gateway harness-config

harness-config: ## Create local harness.yaml from harness.yaml.example if missing
	@if [ ! -f "$(HARNESS_YAML)" ]; then \
		cp "$(HARNESS_TEMPLATE)" "$(HARNESS_YAML)"; \
		printf "Created $(HARNESS_YAML) from $(HARNESS_TEMPLATE). Edit it before rebuilding if needed.\n"; \
	else \
		printf "$(HARNESS_YAML) already exists; leaving local config untouched.\n"; \
	fi

sandbox: harness-config ## Provision and start the sandbox
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

gateway: ## Start a messaging client session: make gateway <pi|hermes> (flags/--stop via the script)
	@bash .oh/scripts/gateway.sh $(GATEWAY_ARGS)

config: harness-config ## Print effective harness.yaml-derived env and resolved compose config
	@if [ -f $(HARNESS_YAML) ]; then \
		sh .oh/scripts/harness-config.sh env $(HARNESS_YAML) > .devcontainer/.harness.yaml.env; \
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
	@printf "\nSandbox CLI (run \033[36minside\033[0m the sandbox after \033[36mmake shell\033[0m):\n"
	@printf "  \033[36moh --help\033[0m  List all \033[36moh\033[0m subcommands\n"
	@printf "  Slack bridge setup: see \033[36m.oh/docs/integrations/slack.md\033[0m\n"
