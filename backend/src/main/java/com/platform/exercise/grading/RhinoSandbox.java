package com.platform.exercise.grading;

import org.mozilla.javascript.*;
import org.springframework.stereotype.Component;

@Component
public class RhinoSandbox {

    private static final int INSTRUCTION_LIMIT = 5_000_000;
    private static final int OBSERVER_THRESHOLD = 10_000;
    private static final Object COUNT_KEY = new Object();

    static {
        ContextFactory.initGlobal(new LimitedContextFactory());
    }

    public String execute(String code) {
        StringBuilder output = new StringBuilder();
        Context cx = Context.enter();
        try {
            cx.putThreadLocal(COUNT_KEY, 0);
            Scriptable scope = cx.initSafeStandardObjects();

            BaseFunction printFn = new BaseFunction() {
                @Override
                public Object call(Context cx, Scriptable scope,
                                   Scriptable thisObj, Object[] args) {
                    if (args.length > 0) {
                        output.append(Context.toString(args[0])).append('\n');
                    }
                    return Context.getUndefinedValue();
                }
            };
            scope.put("print", scope, printFn);

            ScriptableObject window = (ScriptableObject) cx.newObject(scope);
            window.put("alert", window, printFn);
            window.put("prompt", window, new BaseFunction() {
                @Override
                public Object call(Context cx, Scriptable scope,
                                   Scriptable thisObj, Object[] args) {
                    return "";
                }
            });
            scope.put("window", scope, window);

            cx.evaluateString(scope, code, "student", 1, null);
        } finally {
            Context.exit();
        }
        return output.toString().stripTrailing();
    }

    private static class LimitedContextFactory extends ContextFactory {

        @Override
        protected Context makeContext() {
            Context cx = super.makeContext();
            cx.setOptimizationLevel(-1);
            cx.setInstructionObserverThreshold(OBSERVER_THRESHOLD);
            return cx;
        }

        @Override
        protected void observeInstructionCount(Context cx, int instructionCount) {
            Integer prev = (Integer) cx.getThreadLocal(COUNT_KEY);
            int total = (prev == null ? 0 : prev) + instructionCount;
            cx.putThreadLocal(COUNT_KEY, total);
            if (total > INSTRUCTION_LIMIT) {
                throw new InstructionLimitExceededException();
            }
        }
    }
}
