SHELL := /bin/sh

.PHONY: dev prod build stop

dev:
	docker compose up dev

prod:
	docker compose up -d web

build:
	docker compose build web

stop:
	docker compose down
