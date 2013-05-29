MOCHA = "./node_modules/.bin/mocha"

MOCHA_FLAGS = --ui tdd --reporter spec
ifdef OPTS
	MOCHA_FLAGS += $(OPTS)
endif

test:
	@$(MOCHA) $(MOCHA_FLAGS) $(FILE)

.PHONY: test
