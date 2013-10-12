MOCHA = "./node_modules/.bin/mocha"

MOCHA_FLAGS = --ui tdd --reporter spec
ifdef OPTS
	MOCHA_FLAGS += $(OPTS)
endif

test:
	@./node_modules/.bin/envrun -p 3456 -e test.env --path -- $(MOCHA) $(MOCHA_FLAGS) $(FILE)

.PHONY: test
