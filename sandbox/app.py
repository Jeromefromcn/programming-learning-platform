from flask import Flask, request, jsonify
from executor import run_test_case

app = Flask(__name__)


@app.route('/execute', methods=['POST'])
def execute():
    data = request.get_json(force=True)
    code = data['code']
    test_cases = data['testCases']
    time_limit = int(data.get('timeLimitSeconds', 5))
    memory_limit_mb = int(data.get('memoryLimitMb', 128))

    results = []
    for i, tc in enumerate(test_cases):
        result = run_test_case(
            code,
            tc['input'],
            tc['expectedOutput'],
            time_limit,
            memory_limit_mb
        )
        results.append({'index': i, **result})

    return jsonify({'results': results})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
