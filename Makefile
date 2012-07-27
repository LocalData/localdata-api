MOCHA = "./node_modules/.bin/mocha"

test:
	@$(MOCHA) --ui tdd

.PHONY: test
