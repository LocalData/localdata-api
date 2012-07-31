MOCHA = "./node_modules/.bin/mocha"

test:
	@$(MOCHA) --ui tdd --reporter spec

.PHONY: test
