#!/usr/bin/env python3
"""Measure which project classes the JVM loads in one run, and when.

The Code layer draws a class in a step only if it was really loaded, so an implementation the run
never touched is not drawn. This runs your command once with -Xlog:class+load and keeps the
project's classes, in load order, with the command that produced them.

    python3 classload.py --prefix com.acme. --out report/run-trace/classload.json \\
        [--boot-until-class com.acme.cli.Runner | --boot-until-output 'process running for ([\\d.]+)'] \\
        -- java -cp "$CP" com.acme.Main run --replay

Everything after `--` is the command, which must launch `java`. Classes loaded before the boot
mark are tagged phase "boot", the rest "run"; with no mark, every class is "run".
  --boot-until-class   boot ends when this class is first loaded
  --boot-until-output  boot ends at the uptime (seconds) captured by group 1 of this regex in the
                       program's output. Spring Boot prints one: 'process running for ([\\d.]+)'

Choose a run that writes nothing you care about (a replay, a dry run): this executes it for real.
"""
import argparse, datetime, json, os, re, subprocess, sys, tempfile


def main():
    argv = sys.argv[1:]
    if "--" not in argv:
        sys.exit(__doc__)
    cut = argv.index("--")
    ap = argparse.ArgumentParser(add_help=False)
    ap.add_argument("--prefix", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--boot-until-class")
    ap.add_argument("--boot-until-output")
    ap.add_argument("--note", default="")
    a = ap.parse_args(argv[:cut])
    cmd = argv[cut + 1:]
    at = next((i for i, x in enumerate(cmd) if os.path.basename(x) == "java"), None)
    if at is None:
        sys.exit("classload: the command after -- must launch `java`")
    with tempfile.TemporaryDirectory() as d:
        log = os.path.join(d, "classload.log")
        full = cmd[:at + 1] + [f"-Xlog:class+load:file={log}:uptime"] + cmd[at + 1:]
        run = subprocess.run(full, capture_output=True, text=True)
        sys.stdout.write(run.stdout[-4000:])
        sys.stderr.write(run.stderr[-4000:])
        if not os.path.exists(log):
            sys.exit("classload: the JVM wrote no class-load log; nothing recorded")
        loads = []
        with open(log, encoding="utf-8", errors="replace") as f:
            for line in f:
                m = re.match(r"\[\s*([\d.]+)s\]\s+(\S+) source:", line)
                if m and m.group(2).startswith(a.prefix):
                    loads.append((float(m.group(1)), m.group(2)))
    boot_end, how = None, "no boot mark given: every class is phase 'run'"
    if a.boot_until_class:
        boot_end = next((t for t, c in loads if c == a.boot_until_class), None)
        how = f"boot ends at the first load of {a.boot_until_class}"
        if boot_end is None:
            sys.exit(f"classload: {a.boot_until_class} was never loaded, so there is no boot mark; nothing recorded")
    elif a.boot_until_output:
        m = re.search(a.boot_until_output, run.stdout + run.stderr)
        if not m:
            sys.exit(f"classload: the output never matched {a.boot_until_output!r}; nothing recorded")
        boot_end, how = float(m.group(1)), f"boot ends at uptime {m.group(1)} s, read from the program's output"
    record = {
        "what": "Project classes the JVM loaded during one run, in load order (-Xlog:class+load). " + how + ".",
        "command": " ".join(full).replace(log, "classload.log"),
        "measured_on": datetime.date.today().isoformat(),
        "exit_code": run.returncode,
        "prefix": a.prefix,
        "boot_ends_at_uptime_s": boot_end,
        "note": a.note,
        "classes": [{"class": c, "phase": "boot" if boot_end is not None and t < boot_end else "run", "uptime_s": t} for t, c in loads],
    }
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(record, f, indent=1)
    n_boot = sum(1 for c in record["classes"] if c["phase"] == "boot")
    print(f"\n{a.out}: {len(loads)} project classes loaded ({n_boot} at boot), exit code {run.returncode}")
    if run.returncode:
        print("classload: the run FAILED. The file is written and says so; do not present it as a measurement of a good run.")
        sys.exit(1)


if __name__ == "__main__":
    main()
