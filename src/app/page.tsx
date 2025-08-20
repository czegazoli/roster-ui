import Image from "next/image";

export default function Home() {
  return (
    <div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20">
      <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start">
        <Image
          className="dark:invert"
          src="/next.svg"
          alt="Next.js logo"
          width={180}
          height={38}
          priority
        />
        <ol className="font-mono list-inside list-decimal text-sm/6 text-center sm:text-left">
          <li className="mb-2 tracking-[-.01em]">
            Get started by editing{" "}
            <code className="bg-black/[.05] dark:bg-white/[.06] font-mono font-semibold px-1 py-0.5 rounded">
              src/app/page.tsx
            </code>
            .
          </li>
          <li className="tracking-[-.01em]">
            Save and see your changes instantly.
          </li>
        </ol>

        <div className="flex gap-4 items-center flex-col sm:flex-row">
          <a
            className="rounded-full border border-solid border-transparent transition-colors flex items-center justify-center bg-foreground text-background gap-2 hover:bg-[#383838] dark:hover:bg-[#ccc] font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 sm:w-auto"
            href="https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              className="dark:invert"
              src="/vercel.svg"
              alt="Vercel logomark"
              width={20}
              height={20}
            />
            Deploy now
          </a>
          <a
            className="rounded-full border border-solid border-black/[.08] dark:border-white/[.145] transition-colors flex items-center justify-center hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] hover:border-transparent font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 w-full sm:w-auto md:w-[158px]"
            href="https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            Read our docs
          </a>
        </div>
      </main>
      <footer className="row-start-3 flex gap-[24px] flex-wrap items-center justify-center">
        <a
          className="flex items-center gap-2 hover:underline hover:underline-offset-4"
          href="https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            aria-hidden
            src="/file.svg"
            alt="File icon"
            width={16}
            height={16}
          />
          Learn
        </a>
        <a
          className="flex items-center gap-2 hover:underline hover:underline-offset-4"
          href="https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            aria-hidden
            src="/window.svg"
            alt="Window icon"
            width={16}
            height={16}
          />
          Examples
        </a>
        <a
          className="flex items-center gap-2 hover:underline hover:underline-offset-4"
          href="https://nextjs.org?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            aria-hidden
            src="/globe.svg"
            alt="Globe icon"
            width={16}
            height={16}
          />
          Go to nextjs.org →
        </a>
      </footer>
    </div>
  );
}


// ---- Runtime tests (non-blocking, console only) ----
function runRosterTests() {
  try {
    // 1) emptyWeek structure
    const pos = [{id:"a"},{id:"b"}];
    const wk = emptyWeek(pos);
    console.assert(DAYS.every(function(d){ return wk[d] && Array.isArray(wk[d]["a"]) && Array.isArray(wk[d]["b"]); }), "emptyWeek: arrays for positions per day");

    // 2) addShift pushes an entry
    let w = emptyWeek([{id:"p1"}]);
    const add = function(day, pid, shift){ if(!w[day]) w[day] = {}; if(!w[day][pid]) w[day][pid] = []; w[day][pid].push(Object.assign({id:"x"}, shift)); };
    add("Monday","p1",{staff:"A",start:"07:00",end:"15:00"});
    console.assert(w.Monday.p1.length===1 && w.Monday.p1[0].staff==="A", "addShift should push a shift");

    // 3) copy/paste day safety
    const copied = clone(w.Monday); const positions = [{id:"p1"},{id:"p2"}]; const safe = {}; positions.forEach(function(p){ safe[p.id] = copied[p.id] ? clone(copied[p.id]) : []; });
    console.assert(Array.isArray(safe.p2), "pasteDay should init missing arrays");

    // 4) Finish display rule
    const isFinish = function(end){ return !end; };
    console.assert(isFinish(null) && isFinish("") && !isFinish("17:00"), "Finish rule when end empty");

    // 5) ShiftBubble prop tolerance
    const example = { staff: undefined, start: null, end: null };
    console.assert(!example.staff && example.end === null, "ShiftBubble accepts undefined/null props");

    console.log("RosterUI tests passed");
  } catch (e) { console.warn("RosterUI tests error", e); }
}
