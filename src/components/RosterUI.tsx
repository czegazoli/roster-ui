"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDroppable,
  DragStartEvent,
  DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, addDays, startOfWeek } from "date-fns";
import {
  Copy,
  ClipboardPaste,
  Plus,
  Settings2,
  ChevronLeft,
  ChevronRight,
  Grid,
  CalendarDays,
  UserRound,
  Bell,
  Search,
  ChevronDown,
  Clock,
  LayoutList,
} from "lucide-react";
function Watermark() {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[9999]">
      <span className="select-none text-[12px] px-2 py-1 rounded-md bg-white/80 text-gray-600 border">
        Only for demonstration purposes
      </span>
    </div>
  );
}


/**
 * Roster UI — styled to mirror the screenshot and with a static top bar
 * NOTE: top bar and header controls are visual only.
 */

/* ===================== Types & Constants ===================== */
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export type Day = typeof DAYS[number];

export interface Position {
  id: string;
  name: string;
}
export interface Shift {
  id: string;
  staff?: string;
  start?: string | null;
  end?: string | null;
}
export type DayMap = Record<string, Shift[]>; // positionId -> shifts
export type Week = Record<Day, DayMap>;

interface DragData {
  day: Day;
  positionId: string;
  shiftId?: string;
  shift: Shift;
}

interface EditDialogState {
  open: boolean;
  day: Day;
  positionId: string;
  shift: Shift;
  staff: string[];
  onUpdate: (day: Day, posId: string, shiftId: string, patch: Partial<Shift>) => void;
}

/* ===================== Helpers ===================== */
function uid() {
  return Math.random().toString(36).slice(2, 9);
}
function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

const LS_KEY = "roster-ui-state-v1";
function loadState():
  | { weekStart?: string; positions?: Position[]; staff?: string[]; week?: Week }
  | null {
  try {
    const raw =
      typeof window !== "undefined"
        ? window.localStorage.getItem(LS_KEY)
        : null;
    return raw
      ? (JSON.parse(raw) as {
          weekStart?: string;
          positions?: Position[];
          staff?: string[];
          week?: Week;
        })
      : null;
  } catch {
    return null;
  }
}
function saveState(state: unknown): void {
  try {
    if (typeof window !== "undefined")
      window.localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/* ===================== Defaults ===================== */
const defaultPositions: Position[] = [
  { id: uid(), name: "HC Mix" },
  { id: uid(), name: "HC Kitchen" },
  { id: uid(), name: "HC Washroom" },
  { id: uid(), name: "HC Grunwald" },
  { id: uid(), name: "HC Grunwald 2." },
  { id: uid(), name: "HC Scanima" },
  { id: uid(), name: "LC Goods In" },
  { id: uid(), name: "LC Salad packing" },
  { id: uid(), name: "LC Kitchen 2." },
  { id: uid(), name: "LC Potato room" },
  { id: uid(), name: "LC Packaging labels" },
  { id: uid(), name: "Van run" },
  { id: uid(), name: "Cleaning" },
];

const defaultStaff: string[] = [
  "Adrian L.",
  "Aga",
  "Ann P.",
  "Anton",
  "Arek S.",
  "Aziz A.",
  "Barbara S.",
  "Catriona C.",
  "Eftikhar M.",
  "Fergal F.",
  "Gerard L.",
  "Hafizullah",
  "Haroon O.",
  "Holly",
  "James G.",
  "John M.",
  "Jolanta W.",
  "Justyna P.",
  "Leo",
  "Lexis B.",
  "Luciana",
  "Madaci M.",
  "Martin F.",
  "Mary",
  "Michael G.",
  "Mohamed Y.",
  "Muhib Tareen",
  "Nabil",
  "Nazih B.",
  "Nouar M.",
  "Radik",
  "Rene C.",
  "Roma",
  "Rosangela",
  "Safdar K.",
  "Salman A.",
  "Seafallah A.",
  "Simon F.",
  "Tatiana G.",
  "Tatiana M.",
  "Vaidas Z",
  "Vice P.",
  "Vick P.",
  "Vlado A.",
  "Volodymyr M.",
  "Zarina",
  "Zoltan K.",
  "Guilherme D.",
  "Lucas",
  "Oluwole",
];

function emptyWeek(positions: { id: string }[]): Week {
  const base = {} as Week;
  DAYS.forEach((d) => {
    const dm: DayMap = {};
    positions.forEach((p) => (dm[p.id] = []));
    base[d] = dm;
  });
  return base;
}

/* ============ Global editor handle for Sortable children ============ */
let editDialogSetState: React.Dispatch<React.SetStateAction<EditDialogState>> | null =
  null;
function openEditShiftDialog(
  args: Omit<EditDialogState, "open"> & { open?: boolean }
) {
  if (editDialogSetState)
    editDialogSetState((_) => ({ ...args, open: true } as EditDialogState));
}

/* ===================== Page ===================== */
export default function RosterUI() {
  const saved = loadState() || {};
  const initialWeekStart = saved.weekStart
    ? new Date(saved.weekStart)
    : startOfWeek(new Date(), { weekStartsOn: 1 });
  const [weekStart, setWeekStart] = useState<Date>(initialWeekStart);
  const [positions, setPositions] = useState<Position[]>(
    saved.positions || defaultPositions
  );
  const [staff, setStaff] = useState<string[]>(saved.staff || defaultStaff);
  const [week, setWeek] = useState<Week>(
    saved.week || emptyWeek(saved.positions || defaultPositions)
  );
  const [activeDrag, setActiveDrag] = useState<DragData | null>(null);
  const [copiedDay, setCopiedDay] = useState<DayMap | null>(null);

  // Ensure week has all current positions
  useEffect(() => {
    setWeek((w) => {
      const copy = clone(w);
      (DAYS as readonly Day[]).forEach((d) => {
        if (!copy[d]) copy[d] = {} as DayMap;
        positions.forEach((p) => {
          if (!copy[d][p.id]) copy[d][p.id] = [];
        });
      });
      return copy;
    });
  }, [positions]);

  // Persist state
  useEffect(() => {
    saveState({ weekStart, positions, staff, week });
  }, [weekStart, positions, staff, week]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  function onDragStart(event: DragStartEvent) {
    const data = event.active.data.current as DragData | undefined;
    setActiveDrag(data || null);
  }
  function onDragEnd(event: DragEndEvent) {
    const src = (event.active.data.current as DragData | undefined) || null;
    const dst = (event.over?.data.current as DragData | undefined) || null;
    setActiveDrag(null);
    if (!src || !dst) return;
    setWeek((w) => {
      const next = clone(w);
      const fromList = next[src.day]?.[src.positionId] ?? null;
      if (!fromList) return w;
      const idx = fromList.findIndex((s) => s.id === src.shiftId);
      if (idx === -1) return w;
      const [moved] = fromList.splice(idx, 1);
      if (!next[dst.day]) next[dst.day] = {} as DayMap;
      if (!next[dst.day][dst.positionId]) next[dst.day][dst.positionId] = [];
      const toList = next[dst.day][dst.positionId];
      if (dst.shiftId) {
        const insertAt = toList.findIndex((s) => s.id === dst.shiftId);
        if (insertAt < 0) toList.push(moved);
        else toList.splice(insertAt, 0, moved);
      } else {
        toList.push(moved);
      }
      return next;
    });
  }

  function addPosition(name?: string) {
    const p: Position = {
      id: uid(),
      name: name || `Position ${positions.length + 1}`,
    };
    setPositions((ps) => ps.concat([p]));
    setWeek((w) => {
      const next = clone(w);
      (DAYS as readonly Day[]).forEach((d) => (next[d][p.id] = []));
      return next;
    });
  }
  function removePosition(id: string) {
    setPositions((ps) => ps.filter((x) => x.id !== id));
    setWeek((w) => {
      const n = clone(w);
      (DAYS as readonly Day[]).forEach((d) => {
        if (n[d]) delete n[d][id];
      });
      return n;
    });
  }
  function addShift(day: Day, positionId: string, shift: Omit<Shift, "id">) {
    setWeek((w) => {
      const n = clone(w);
      if (!n[day]) n[day] = {} as DayMap;
      if (!n[day][positionId]) n[day][positionId] = [];
      n[day][positionId].push({ id: uid(), ...shift });
      return n;
    });
  }
  function updateShift(
    day: Day,
    positionId: string,
    shiftId: string,
    patch: Partial<Shift>
  ) {
    setWeek((w) => {
      const next = clone(w);
      const arr = next[day]?.[positionId];
      if (!arr) return w;
      const i = arr.findIndex((s) => s.id === shiftId);
      if (i >= 0) arr[i] = { ...arr[i], ...patch };
      return next;
    });
  }

  function copyDay(day: Day) {
    setCopiedDay(clone(week[day] || {}));
  }
  function pasteDay(toDay: Day) {
    if (!copiedDay) return;
    setWeek((w) => {
      const n = clone(w);
      const safe: DayMap = {};
      positions.forEach((p) => {
        safe[p.id] = copiedDay[p.id] ? clone(copiedDay[p.id]) : [];
      });
      n[toDay] = safe;
      return n;
    });
  }
  function clearWeek() {
    if (
      typeof window === "undefined" ||
      window.confirm("Clear all shifts for this week?")
    )
      setWeek(emptyWeek(positions));
  }

  const dates = useMemo(
    () => (DAYS as readonly Day[]).map((_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const totalCols = 1 + DAYS.length;

  return (
    <div className="min-h-screen bg-[#f5f6f8] text-[13px] text-gray-800">
      {/* ======= Static top navigation (visual only) ======= */}
      <TopBar />

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 pb-10">
        {/* ======= Secondary navbar (tabs like in screenshot) ======= */}
        <div className="pt-4" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[12px]">
            <NavPill active>My Roster</NavPill>
            <NavPill>My Payroll Confirmation</NavPill>
            <NavPill activeAccent>Set Staff Rosters</NavPill>
            <NavPill>Confirm Staff Payroll</NavPill>
            <NavPill>Custom Report</NavPill>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="h-8 px-3">
              <Clock className="w-4 h-4 mr-2" />
              My Unavailabilities
            </Button>
            <Button variant="outline" className="h-8 px-3">
              <CalendarDays className="w-4 h-4 mr-2" />
              Add to Calendar
            </Button>
            <Button variant="outline" className="h-8 px-3">
              <Settings2 className="w-4 h-4 mr-2" />
              Roster Settings
            </Button>
            <Button className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700">
              + Add Roster
            </Button>
          </div>
        </div>

        {/* ======= Range + view controls bar ======= */}
        <div className="mt-4 rounded-xl border bg-white shadow-sm">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <div className="flex items-center gap-2">
              <RangePill
                start={weekStart}
                end={addDays(weekStart, 6)}
                onPrev={() => setWeekStart(addDays(weekStart, -7))}
                onNext={() => setWeekStart(addDays(weekStart, 7))}
              />
              <div className="ml-4 flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-8">
                  <Search className="w-4 h-4 mr-2" />
                  Test v1
                </Button>
                <Button variant="outline" size="sm" className="h-8">
                  User View
                </Button>
                <Button variant="outline" size="sm" className="h-8">
                  Expanded View
                </Button>
                <Button variant="outline" size="sm" className="h-8">
                  Shift View
                </Button>
                <Button variant="outline" size="sm" className="h-8">
                  Allocation
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <WeekPicker value={weekStart} onChange={setWeekStart} />
            </div>
          </div>

          {/* ======= Table ======= */}
          <div className="p-3">
            <div className="overflow-auto rounded-2xl border border-muted/40 bg-card">
              <table className="w-full min-w-[980px] text-sm border-separate border-spacing-x-0 border-spacing-y-2">
                <thead>
                  <tr className="bg-transparent">
                    <th className="sticky left-0 z-10 bg-white text-left p-3 w-56 rounded-l-2xl shadow-sm">
                      <div className="font-semibold text-[14px] flex items-center gap-2">
                        <LayoutList className="w-4 h-4" />
                        Popular Shifts
                      </div>
                      <div className="text-[11px] text-gray-500 mt-1">
                        Week {format(weekStart, "II")} — {format(weekStart, "dd/MM/yyyy")} -{" "}
                        {format(addDays(weekStart, 6), "dd/MM/yyyy")}
                      </div>
                    </th>
                    {(DAYS as readonly Day[]).map((d, i) => (
                      <th key={d} className="p-0 text-center align-middle">
                        <div className="m-2 flex items-center justify-between gap-2 rounded-2xl bg-[#f2f3f5] px-3 py-2 shadow-sm">
                          <div className="text-left">
                            <div className="font-semibold">{d.slice(0, 3)}</div>
                            <div className="text-xs opacity-70">
                              {format(dates[i], "dd-MM")}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Copy day"
                              onClick={() => copyDay(d)}
                              className="h-7 w-7"
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Paste day"
                              onClick={() => pasteDay(d)}
                              disabled={!copiedDay}
                              className="h-7 w-7"
                            >
                              <ClipboardPaste className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <DndContext
                    sensors={sensors}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    collisionDetection={closestCenter}
                  >
                    {positions.map((p, rowIndex) => (
                      <React.Fragment key={p.id}>
                        <tr className="group">
                          {/* Position title: centered; hover to edit */}
                          <td className="sticky left-0 z-10 bg-white p-2 align-middle text-center">
                            <div className="relative inline-block text-center w-56 mx-auto">
                              <span className="font-medium select-none">
                                {p.name}
                              </span>
                              <Input
                                className="h-8 w-56 absolute inset-0 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition bg-background/90 border-0 focus-visible:ring-1"
                                value={p.name}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setPositions((ps) =>
                                    ps.map((x) =>
                                      x.id === p.id ? { id: x.id, name: v } : x
                                    )
                                  );
                                }}
                              />
                            </div>
                          </td>
                          {(DAYS as readonly Day[]).map((d) => (
                            <td
                              key={`${d}-${p.id}`}
                              className="align-top p-2 bg-white"
                            >
                              <DayCell
                                day={d}
                                positionId={p.id}
                                shifts={week[d]?.[p.id] ?? []}
                                staff={staff}
                                onAdd={addShift}
                                onUpdate={updateShift}
                              />
                            </td>
                          ))}
                        </tr>
                        {/* Gradient separator between areas */}
                        {rowIndex < positions.length - 1 ? (
                          <tr aria-hidden="true">
                            <td colSpan={totalCols}>
                              <div className="h-3 bg-gradient-to-b from-transparent via-muted/50 to-transparent" />
                            </td>
                          </tr>
                        ) : null}
                      </React.Fragment>
                    ))}
                    <DragOverlay>
                      {activeDrag ? (
                        <ShiftBubble
                          staff={activeDrag.shift.staff}
                          start={activeDrag.shift.start}
                          end={activeDrag.shift.end}
                          isDragging
                        />
                      ) : null}
                    </DragOverlay>
                  </DndContext>
                  <tr>
                    <td className="sticky left-0 bg-white p-2" colSpan={1}>
                      <AddPosition onAdd={addPosition} />
                    </td>
                    <td colSpan={DAYS.length} className="p-2"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* edit dialog lives at root */}
        <ShiftEditDialog />

        {/* Settings dialog (re-usable) */}
        <div className="mt-4 flex items-center justify-end">
          <RosterSettings
            staff={staff}
            setStaff={setStaff}
            positions={positions}
            addPosition={addPosition}
            removePosition={removePosition}
          />
          <Button variant="outline" onClick={clearWeek} className="ml-2">
            Clear week
          </Button>
        </div>
      </main>
      <Watermark />
    </div>
  );
}

/* ===================== Static Top Bar ===================== */
function TopBar() {
  return (
    <header className="w-full bg-[#0b1d2b] text-white shadow-sm">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-12 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="font-bold tracking-wide">HR Demo</div>
          <TopLink active>Dashboard</TopLink>
          <TopLink>
            Calendar <ChevronDown className="w-3 h-3 ml-1" />
          </TopLink>
          <TopLink>Leave</TopLink>
          <TopLink>Time</TopLink>
          <TopLink active>Roster</TopLink>
          <TopLink>Performance</TopLink>
          <TopLink>Information &amp; Guidance</TopLink>
          <TopLink>
            Manager <ChevronDown className="w-3 h-3 ml-1" />
          </TopLink>
        </div>
        <div className="flex items-center gap-4">
          <Grid className="w-5 h-5 opacity-90" />
          <Bell className="w-5 h-5 opacity-90" />
          <UserRound className="w-5 h-5 opacity-90" />
        </div>
      </div>
    </header>
  );
}

function TopLink({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <div
      className={
        "hidden md:flex items-center text-[13px] px-2 py-1 rounded " +
        (active ? "bg-white/10 font-medium" : "opacity-80 hover:opacity-100")
      }
    >
      {children}
    </div>
  );
}

/* ===================== Header controls ===================== */
function RangePill({
  start,
  end,
  onPrev,
  onNext,
}: {
  start: Date;
  end: Date;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" className="h-8 w-8" onClick={onPrev}>
        <ChevronLeft className="w-4 h-4" />
      </Button>
      <div className="px-3 py-1.5 rounded-full bg-[#eef1f4] text-[12px]">
        {format(start, "dd MMM")} - {format(end, "dd MMM")}
      </div>
      <Button variant="outline" size="icon" className="h-8 w-8" onClick={onNext}>
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

function WeekPicker({
  value,
  onChange,
}: {
  value: Date;
  onChange: (d: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="min-w-[240px] justify-start h-8">
          <CalendarDays className="w-4 h-4 mr-2" />
          {format(value, "dd/MM/yyyy")} — {format(addDays(value, 6), "dd/MM/yyyy")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-2">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(d) => {
            if (d) onChange(startOfWeek(d, { weekStartsOn: 1 }));
            setOpen(false);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

/* ===================== Grid components ===================== */
function AddPosition({ onAdd }: { onAdd: (name?: string) => void }) {
  const [name, setName] = useState("");
  return (
    <div className="flex items-center gap-2">
      <Input
        placeholder="Add position"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-8 w-48"
      />
      <Button
        size="sm"
        onClick={() => {
          onAdd(name.trim());
          setName("");
        }}
      >
        <Plus className="w-4 h-4 mr-1" />
        Add
      </Button>
    </div>
  );
}

function DayCell({
  day,
  positionId,
  shifts,
  staff,
  onAdd,
  onUpdate,
}: {
  day: Day;
  positionId: string;
  shifts: Shift[];
  staff: string[];
  onAdd: (day: Day, posId: string, payload: Omit<Shift, "id">) => void;
  onUpdate: (
    day: Day,
    posId: string,
    shiftId: string,
    patch: Partial<Shift>
  ) => void;
}) {
  const { setNodeRef } = useDroppable({
    id: `cell-${day}-${positionId}`,
    data: { day, positionId },
  });
  const [open, setOpen] = useState(false);
  return (
    <div
      ref={setNodeRef}
      className="space-y-2 min-h-[64px] rounded-xl p-1 hover:bg-muted/20 transition"
    >
      <div className="flex flex-wrap gap-2">
        <SortableContext items={shifts.map((s) => s.id)} strategy={rectSortingStrategy}>
          {shifts.map((shift) => (
            <SortableShift
              key={shift.id}
              day={day}
              positionId={positionId}
              shift={shift}
              onUpdate={onUpdate}
              staff={staff}
            />
          ))}
        </SortableContext>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            className="h-7 px-2 text-xs rounded-lg"
          >
            <Plus className="w-3 h-3 mr-1" />
            Roster Start Date
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add shift</DialogTitle>
            <DialogDescription>
              Select staff and times (leave end empty for Finish).
            </DialogDescription>
          </DialogHeader>
          <ShiftForm
            staff={staff}
            onSubmit={(payload) => {
              onAdd(day, positionId, payload);
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SortableShift({
  day,
  positionId,
  shift,
  onUpdate,
  staff,
}: {
  day: Day;
  positionId: string;
  shift: Shift;
  onUpdate: (
    day: Day,
    posId: string,
    shiftId: string,
    patch: Partial<Shift>
  ) => void;
  staff: string[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: shift.id,
      data: { day, positionId, shiftId: shift.id, shift } as DragData,
    });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition as string | undefined,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <ShiftBubble
        staff={shift.staff}
        start={shift.start}
        end={shift.end}
        isDragging={isDragging}
        onClick={() => {
          openEditShiftDialog({ day, positionId, shift, onUpdate, staff });
        }}
      />
    </div>
  );
}

function ShiftBubble({
  staff,
  start,
  end,
  isDragging,
  onClick,
}: {
  staff?: string;
  start?: string | null;
  end?: string | null;
  isDragging?: boolean;
  onClick?: () => void;
}) {
  const isFinish = !end; // display Finish when end empty
  return (
    <button
      onClick={onClick}
      className={
        "flex flex-col items-center text-center rounded-lg px-4 py-2 shadow-sm transition " +
        (isDragging ? "opacity-70 " : "") +
        "bg-[#f2f3f5] hover:bg-[#e9ebef]"
      }
    >
      <span className="font-medium truncate max-w-[160px]">
        {staff || "(Unassigned)"}
      </span>
      <span className="mt-0.5 text-[10px] text-gray-700 tabular-nums self-center ml-2">
        {(start || "--:--")} — {isFinish ? "Finish" : end || "--:--"}
      </span>
    </button>
  );
}

/* ===================== Shift Edit Dialog ===================== */
function ShiftEditDialog() {
  const [state, setState] = useState<EditDialogState>({
    open: false,
    day: "Monday",
    positionId: "",
    shift: { id: "" },
    staff: [],
    onUpdate: () => {},
  });
  editDialogSetState = setState;
  if (!state.open) return null;
  const s = state;
  return (
    <Dialog
      open={s.open}
      onOpenChange={(v) => setState((prev) => ({ ...prev, open: v }))}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit shift</DialogTitle>
          <DialogDescription>
            Update the staff and times. Leave end empty to mark Finish.
          </DialogDescription>
        </DialogHeader>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <div className="text-xs mb-1">Staff</div>
            <Select
              value={s.shift.staff || ""}
              onValueChange={(v) => {
                s.onUpdate(s.day, s.positionId, s.shift.id, { staff: v });
                setState((prev) => ({
                  ...prev,
                  shift: { ...prev.shift, staff: v },
                }));
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select staff" />
              </SelectTrigger>
              <SelectContent>
                {s.staff.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-xs mb-1">Start</div>
            <Input
              type="time"
              value={s.shift.start || ""}
              onChange={(e) => {
                const v = e.target.value || null;
                s.onUpdate(s.day, s.positionId, s.shift.id, { start: v });
                setState((prev) => ({
                  ...prev,
                  shift: { ...prev.shift, start: v },
                }));
              }}
            />
          </div>
          <div>
            <div className="text-xs mb-1">End</div>
            <Input
              type="time"
              value={s.shift.end || ""}
              onChange={(e) => {
                const v = e.target.value || null;
                s.onUpdate(s.day, s.positionId, s.shift.id, { end: v });
                setState((prev) => ({
                  ...prev,
                  shift: { ...prev.shift, end: v },
                }));
              }}
              placeholder="Leave empty for Finish"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ===================== Add Shift Form ===================== */
function ShiftForm({
  staff,
  onSubmit,
}: {
  staff: string[];
  onSubmit: (payload: Omit<Shift, "id">) => void;
}) {
  const [sel, setSel] = useState<string>(staff[0] || "");
  const [start, setStart] = useState<string>("");
  const [end, setEnd] = useState<string>("");
  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <div className="text-xs mb-1">Staff</div>
          <Select value={sel} onValueChange={(v) => setSel(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select staff" />
            </SelectTrigger>
            <SelectContent>
              {staff.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="text-xs mb-1">Start</div>
          <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <div className="text-xs mb-1">End</div>
          <Input
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            placeholder="Leave empty for Finish"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          onClick={() => {
            onSubmit({ staff: sel, start: start || null, end: end || null });
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

/* ===================== Settings ===================== */
function RosterSettings({
  staff,
  setStaff,
  positions,
  addPosition,
  removePosition,
}: {
  staff: string[];
  setStaff: React.Dispatch<React.SetStateAction<string[]>>;
  positions: Position[];
  addPosition: (name?: string) => void;
  removePosition: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [newStaff, setNewStaff] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Settings2 className="w-4 h-4 mr-2" />
          Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Roster Settings</DialogTitle>
          <DialogDescription>Manage staff and positions.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="staff">
          <TabsList>
            <TabsTrigger value="staff">Staff</TabsTrigger>
            <TabsTrigger value="positions">Positions</TabsTrigger>
          </TabsList>
          <TabsContent value="staff" className="mt-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Add staff name"
                  value={newStaff}
                  onChange={(e) => setNewStaff(e.target.value)}
                  className="h-8"
                />
                <Button
                  size="sm"
                  onClick={() => {
                    if (newStaff.trim()) {
                      setStaff((s) => s.concat([newStaff.trim()]));
                      setNewStaff("");
                    }
                  }}
                >
                  Add
                </Button>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                {staff.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between border rounded-xl p-2"
                  >
                    <Input
                      className="h-8"
                      value={s}
                      onChange={(e) => {
                        setStaff((arr) =>
                          arr.map((x, ix) => (ix === i ? e.target.value : x))
                        );
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setStaff((arr) => arr.filter((_, ix) => ix !== i));
                      }}
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
          <TabsContent value="positions" className="mt-4">
            <div className="space-y-2">
              <AddPosition onAdd={addPosition} />
              <div className="grid sm:grid-cols-2 gap-2">
                {positions.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between border rounded-xl p-2"
                  >
                    <Input
                      className="h-8"
                      value={p.name}
                      onChange={() => {
                        /* names are edited inline in main grid */
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removePosition(p.id)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/* ===================== Small UI bits ===================== */
function NavPill({
  children,
  active,
  activeAccent,
}: {
  children: React.ReactNode;
  active?: boolean;
  activeAccent?: boolean;
}) {
  const base =
    "px-3 py-1.5 rounded-full border text-[12px] whitespace-nowrap";
  return (
    <span
      className={
        active
          ? `${base} bg-white shadow-sm`
          : activeAccent
          ? `${base} bg-emerald-50 border-emerald-200 text-emerald-800`
          : `${base} bg-[#f2f3f5] border-transparent`
      }
    >
      {children}
    </span>
  );
}
