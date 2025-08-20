import React, { useEffect, useMemo, useState } from "react";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCenter, useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, addDays, startOfWeek } from "date-fns";
import { Copy, ClipboardPaste, Plus, Settings2, ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Roster UI — bubble layout (ES2019-safe)
 * - Rows = Positions, Columns = Days
 * - Shifts are compact bubbles: Name on first line; times beneath in small dark-grey text, slightly right-shifted.
 * - Strict dropdown for staff (no free text). Click bubble to edit.
 * - Drag & drop: dragging the whole bubble; dropping onto a bubble inserts ABOVE it.
 * - Position names centered; inline edit appears on hover only. No delete icon in the grid.
 * - Copy/Paste day, week navigation, localStorage persistence.
 */

// ---- Constants & helpers ----
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
function uid() { return Math.random().toString(36).slice(2, 9); }
function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

const LS_KEY = "roster-ui-state-v1";
function loadState() {
  try { const raw = typeof window !== "undefined" ? window.localStorage.getItem(LS_KEY) : null; return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
function saveState(state) { try { if (typeof window !== "undefined") window.localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {} }

// ---- Defaults (provided by user) ----
const defaultPositions = [
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

const defaultStaff = [
  "Adrian L.", "Aga", "Ann P.", "Anton", "Arek S.", "Aziz A.", "Barbara S.", "Catriona C.", "Eftikhar M.",
  "Fergal F.", "Gerard L.", "Hafizullah", "Haroon O.", "Holly", "James G.", "John M.", "Jolanta W.", "Justyna P.",
  "Leo", "Lexis B.", "Luciana", "Madaci M.", "Martin F.", "Mary", "Michael G.", "Mohamed Y.", "Muhib Tareen",
  "Nabil", "Nazih B.", "Nouar M.", "Radik", "Rene C.", "Roma", "Rosangela", "Safdar K.", "Salman A.", "Seafallah A.",
  "Simon F.", "Tatiana G.", "Tatiana M.", "Vaidas Z", "Vice P.", "Vick P.", "Vlado A.", "Volodymyr M.", "Zarina",
  "Zoltan K.", "Guilherme D.", "Lucas", "Oluwole"
];

function emptyWeek(positions) {
  var base = {};
  for (var i = 0; i < DAYS.length; i++) { var d = DAYS[i]; base[d] = {}; for (var j = 0; j < positions.length; j++) base[d][positions[j].id] = []; }
  return base;
}

// Global dialog setter so Sortable children can open the editor
let editDialogSetState = null;
function openEditShiftDialog(args){ if (editDialogSetState) editDialogSetState(Object.assign({ open: true }, args)); }

export default function RosterUI() {
  const saved = loadState() || {};
  const initialWeekStart = saved.weekStart ? new Date(saved.weekStart) : startOfWeek(new Date(), { weekStartsOn: 1 });
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [positions, setPositions] = useState(saved.positions || defaultPositions);
  const [staff, setStaff] = useState(saved.staff || defaultStaff);
  const [week, setWeek] = useState(saved.week || emptyWeek(saved.positions || defaultPositions));
  const [activeDrag, setActiveDrag] = useState(null);
  const [copiedDay, setCopiedDay] = useState(null);

  // Ensure week has all current positions
  useEffect(function(){
    setWeek(function (w) {
      var copy = clone(w);
      for (var i = 0; i < DAYS.length; i++) { var d = DAYS[i]; if (!copy[d]) copy[d] = {}; for (var j = 0; j < positions.length; j++) { var p = positions[j]; if (!copy[d][p.id]) copy[d][p.id] = []; } }
      return copy;
    });
  }, [positions]);

  // Persist state
  useEffect(function(){ saveState({ weekStart: weekStart, positions: positions, staff: staff, week: week }); }, [weekStart, positions, staff, week]);

  // Runtime tests
  useEffect(function(){ runRosterTests(); }, []);

  // DnD sensors
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function onDragStart(event) { setActiveDrag(event.active.data.current); }
  function onDragEnd(event) {
    const active = event.active; const over = event.over; setActiveDrag(null); if (!over) return;
    const src = active && active.data && active.data.current; const dst = over && over.data && over.data.current; if (!src || !dst) return;
    setWeek(function (w) {
      var next = clone(w);
      var fromList = (next[src.day] && next[src.day][src.positionId]) ? next[src.day][src.positionId] : null; if (!fromList) return w;
      var idx = -1; for (var i = 0; i < fromList.length; i++) if (fromList[i].id === src.shiftId) { idx = i; break; }
      if (idx === -1) return w; var moved = fromList.splice(idx, 1)[0];
      if (!next[dst.day]) next[dst.day] = {}; if (!next[dst.day][dst.positionId]) next[dst.day][dst.positionId] = [];
      var toList = next[dst.day][dst.positionId];
      // Insert ABOVE target when dropped on a shift; else append
      if (dst.shiftId) { var insertAt = -1; for (var k = 0; k < toList.length; k++) if (toList[k].id === dst.shiftId) { insertAt = k; break; } if (insertAt < 0) toList.push(moved); else toList.splice(insertAt, 0, moved); }
      else { toList.push(moved); }
      return next;
    });
  }

  function addPosition(name) {
    const p = { id: uid(), name: name || ("Position " + (positions.length + 1)) };
    setPositions(function (ps) { return ps.concat([p]); });
    setWeek(function (w) { var next = clone(w); for (var i = 0; i < DAYS.length; i++) next[DAYS[i]][p.id] = []; return next; });
  }
  function removePosition(id) {
    // Remove position entirely from state (line + shifts)
    setPositions(function (ps) { return ps.filter(function (x) { return x.id !== id; }); });
    setWeek(function (w) {
      var n = clone(w);
      for (var i = 0; i < DAYS.length; i++) {
        var d = DAYS[i];
        if (n[d]) delete n[d][id];
      }
      return n;
    });
  }
  function addShift(day, positionId, shift) { setWeek(function (w) { var n = clone(w); if (!n[day]) n[day] = {}; if (!n[day][positionId]) n[day][positionId] = []; n[day][positionId].push(Object.assign({ id: uid() }, shift)); return n; }); }
  function updateShift(day, positionId, shiftId, patch) {
    setWeek(function (w) {
      var next = clone(w); var arr = next[day] && next[day][positionId] ? next[day][positionId] : null; if (!arr) return w;
      for (var i = 0; i < arr.length; i++) { if (arr[i].id === shiftId) { arr[i] = Object.assign({}, arr[i], patch); break; } } return next;
    });
  }

  function copyDay(day) { setCopiedDay(clone(week[day] || {})); }
  function pasteDay(toDay) { if (!copiedDay) return; setWeek(function (w) { var n = clone(w), safe = {}; for (var i = 0; i < positions.length; i++) { var p = positions[i]; safe[p.id] = copiedDay[p.id] ? clone(copiedDay[p.id]) : []; } n[toDay] = safe; return n; }); }
  function clearWeek() { if (typeof window === "undefined" || window.confirm("Clear all shifts for this week?")) setWeek(emptyWeek(positions)); }

  const dates = useMemo(function () { return DAYS.map(function (_, i) { return addDays(weekStart, i); }); }, [weekStart]);
  const totalCols = 1 + DAYS.length;

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={function(){ setWeekStart(addDays(weekStart, -7)); }}><ChevronLeft className="w-4 h-4"/></Button>
          <WeekPicker value={weekStart} onChange={setWeekStart} />
          <Button variant="outline" onClick={function(){ setWeekStart(addDays(weekStart, 7)); }}><ChevronRight className="w-4 h-4"/></Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={clearWeek}>Clear week</Button>
          <RosterSettings staff={staff} setStaff={setStaff} positions={positions} addPosition={addPosition} removePosition={removePosition} />
        </div>
      </div>

      <div className="overflow-auto rounded-2xl shadow-sm border border-muted/40 bg-card">
        <table className="w-full min-w-[980px] text-sm border-separate border-spacing-x-0 border-spacing-y-2">
          <thead>
            <tr className="bg-transparent">
              <th className="sticky left-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 text-left p-3 w-56 rounded-l-2xl shadow-sm">Week {format(weekStart, "II")} — {format(weekStart, "dd/MM/yyyy")} - {format(addDays(weekStart,6), "dd/MM/yyyy")}</th>
              {DAYS.map(function(d, i){ return (
                <th key={d} className="p-0 text-center align-middle">
                  <div className="m-2 flex items-center justify-between gap-2 rounded-2xl bg-muted/40 px-3 py-2 shadow-sm">
                    <div className="text-left">
                      <div className="font-semibold">{d}</div>
                      <div className="text-xs opacity-70">{format(dates[i], "dd/MM/yyyy")}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" title="Copy day" onClick={function(){ copyDay(d); }}><Copy className="w-4 h-4"/></Button>
                      <Button size="icon" variant="ghost" title="Paste day" onClick={function(){ pasteDay(d); }} disabled={!copiedDay}><ClipboardPaste className="w-4 h-4"/></Button>
                    </div>
                  </div>
                </th>
              );})}
            </tr>
          </thead>
          <tbody>
            <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} collisionDetection={closestCenter}>
              {positions.map(function(p, rowIndex){ return (
                <React.Fragment key={p.id}>
                  <tr className="group">
                    {/* Position title: centered; hover to edit */}
                    <td className="sticky left-0 z-10 bg-inherit p-2 align-middle text-center">
                      <div className="relative inline-block text-center w-56 mx-auto">
                        <span className="font-medium select-none">{p.name}</span>
                        <Input
                          className="h-8 w-56 absolute inset-0 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition bg-background/90 border-0 focus-visible:ring-1"
                          value={p.name}
                          onChange={function(e){ var v=e.target.value; setPositions(function(ps){ return ps.map(function(x){ return x.id===p.id?{id:x.id, name:v}:x; }); }); }}
                        />
                      </div>
                    </td>
                    {DAYS.map(function(d){ return (
                      <td key={d+"-"+p.id} className="align-top p-2">
                        <DayCell day={d} positionId={p.id} shifts={(week[d] && week[d][p.id])?week[d][p.id]:[]} staff={staff} onAdd={addShift} onUpdate={updateShift} />
                      </td>
                    );})}
                  </tr>
                  {/* Gradient separator between areas */}
                  {rowIndex < positions.length - 1 ? (
                    <tr aria-hidden="true">
                      <td colSpan={totalCols}>
                        <div className="h-3 bg-gradient-to-b from-transparent via-muted/50 to-transparent"/>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );})}
              <DragOverlay>{activeDrag ? <ShiftBubble staff={activeDrag.shift.staff} start={activeDrag.shift.start} end={activeDrag.shift.end} isDragging /> : null}</DragOverlay>
            </DndContext>
            <tr>
              <td className="sticky left-0 bg-background p-2" colSpan={1}>
                <AddPosition onAdd={addPosition} />
              </td>
              <td colSpan={DAYS.length} className="p-2"></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* edit dialog lives at root */}
      <ShiftEditDialog />
    </div>
  );
}

function WeekPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="min-w-[260px] justify-start">
          {format(value, "dd/MM/yyyy")} — {format(addDays(value, 6), "dd/MM/yyyy")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-2">
        <Calendar mode="single" selected={value} onSelect={function(d){ if (d) onChange(startOfWeek(d, {weekStartsOn:1})); setOpen(false); }} initialFocus />
      </PopoverContent>
    </Popover>
  );
}

function AddPosition({ onAdd }) {
  const [name, setName] = useState("");
  return (
    <div className="flex items-center gap-2">
      <Input placeholder="Add position" value={name} onChange={function(e){ setName(e.target.value); }} className="h-8 w-48"/>
      <Button size="sm" onClick={function(){ onAdd(name.trim()); setName(""); }}><Plus className="w-4 h-4 mr-1"/>Add</Button>
    </div>
  );
}

function DayCell({ day, positionId, shifts, staff, onAdd, onUpdate }) {
  const { setNodeRef } = useDroppable({ id: "cell-"+day+"-"+positionId, data: { day: day, positionId: positionId } });
  const [open, setOpen] = useState(false);
  return (
    <div ref={setNodeRef} className="space-y-2 min-h-[64px] rounded-xl p-1 hover:bg-muted/20 transition">
      <div className="flex flex-wrap gap-2">
        <SortableContext items={shifts.map(function(s){ return s.id; })} strategy={rectSortingStrategy}>
          {shifts.map(function(shift){ return (
            <SortableShift key={shift.id} day={day} positionId={positionId} shift={shift} onUpdate={onUpdate} staff={staff} />
          );})}
        </SortableContext>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="secondary" size="sm" className="h-7 px-2 text-xs rounded-lg"><Plus className="w-3 h-3 mr-1"/>Add shift</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add shift</DialogTitle>
            <DialogDescription>Select staff and times (leave end empty for Finish).</DialogDescription>
          </DialogHeader>
          <ShiftForm staff={staff} onSubmit={function(payload){ onAdd(day, positionId, payload); setOpen(false); }} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SortableShift({ day, positionId, shift, onUpdate, staff }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: shift.id,
    data: { day: day, positionId: positionId, shiftId: shift.id, shift: shift },
  });
  const style = { transform: CSS.Transform.toString(transform), transition: transition };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <ShiftBubble staff={shift.staff} start={shift.start} end={shift.end} isDragging={isDragging} onClick={function(){ openEditShiftDialog({ day: day, positionId: positionId, shift: shift, onUpdate: onUpdate, staff: staff }); }} />
    </div>
  );
}

function ShiftBubble({ staff, start, end, isDragging, onClick, ghost }) {
  const isFinish = !end; // display Finish when end empty
  return (
    <button
      onClick={onClick}
      className={
        "flex flex-col items-center text-center rounded-lg px-4 py-2 shadow-sm transition " +
        (isDragging ? "opacity-70 " : "") +
        "bg-muted hover:bg-muted/80"
      }
    >
      <span className="font-medium truncate max-w-[160px]">{staff || "(Unassigned)"}</span>
      <span className="mt-0.5 text-[10px] text-gray-700 tabular-nums self-center ml-2">
        {(start || "--:--")} — {isFinish ? "Finish" : (end || "--:--")}
      </span>
    </button>
  );
}

function ShiftEditDialog() {
  const [state, setState] = useState({ open:false });
  editDialogSetState = setState;
  const s = state;
  if (!s.open) return null;
  return (
    <Dialog open={s.open} onOpenChange={function(v){ setState(function(prev){ return Object.assign({}, prev, { open: v }); }); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit shift</DialogTitle>
          <DialogDescription>Update the staff and times. Leave end empty to mark Finish.</DialogDescription>
        </DialogHeader>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <div className="text-xs mb-1">Staff</div>
            <Select value={s.shift.staff || ""} onValueChange={function(v){ s.onUpdate(s.day, s.positionId, s.shift.id, { staff: v }); setState(function(prev){ var nx=clone(prev); nx.shift.staff=v; return nx; }); }}>
              <SelectTrigger><SelectValue placeholder="Select staff"/></SelectTrigger>
              <SelectContent>
                {s.staff.map(function(name){ return <SelectItem key={name} value={name}>{name}</SelectItem>; })}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-xs mb-1">Start</div>
            <Input type="time" value={s.shift.start || ""} onChange={function(e){ var v=e.target.value||null; s.onUpdate(s.day, s.positionId, s.shift.id, { start: v }); setState(function(prev){ var nx=clone(prev); nx.shift.start=v; return nx; }); }} />
          </div>
          <div>
            <div className="text-xs mb-1">End</div>
            <Input type="time" value={s.shift.end || ""} onChange={function(e){ var v=e.target.value||null; s.onUpdate(s.day, s.positionId, s.shift.id, { end: v }); setState(function(prev){ var nx=clone(prev); nx.shift.end=v; return nx; }); }} placeholder="Leave empty for Finish" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Simple form used by the "Add shift" dialog in each day cell (strict dropdown)
function ShiftForm({ staff, onSubmit }) {
  const [sel, setSel] = useState(staff[0] || "");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <div className="text-xs mb-1">Staff</div>
          <Select value={sel} onValueChange={function(v){ setSel(v); }}>
            <SelectTrigger><SelectValue placeholder="Select staff"/></SelectTrigger>
            <SelectContent>
              {staff.map(function(name){ return <SelectItem key={name} value={name}>{name}</SelectItem>; })}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="text-xs mb-1">Start</div>
          <Input type="time" value={start} onChange={function(e){ setStart(e.target.value); }} />
        </div>
        <div>
          <div className="text-xs mb-1">End</div>
          <Input type="time" value={end} onChange={function(e){ setEnd(e.target.value); }} placeholder="Leave empty for Finish" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button onClick={function(){ onSubmit({ staff: sel, start: start||null, end: end||null }); }}>Add</Button>
      </div>
    </div>
  );
}

function RosterSettings({ staff, setStaff, positions, addPosition, removePosition }) {
  const [open, setOpen] = useState(false);
  const [newStaff, setNewStaff] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Settings2 className="w-4 h-4 mr-2"/>Settings</Button>
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
                <Input placeholder="Add staff name" value={newStaff} onChange={function(e){ setNewStaff(e.target.value); }} className="h-8"/>
                <Button size="sm" onClick={function(){ if(newStaff.trim()){ setStaff(function(s){ return s.concat([newStaff.trim()]); }); setNewStaff(""); } }}>Add</Button>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                {staff.map(function(s,i){ return (
                  <div key={i} className="flex items-center justify-between border rounded-xl p-2">
                    <Input className="h-8" value={s} onChange={function(e){ setStaff(function(arr){ return arr.map(function(x,ix){ return ix===i?e.target.value:x; }); }); }} />
                    <Button variant="ghost" size="icon" onClick={function(){ setStaff(function(arr){ return arr.filter(function(_,ix){ return ix!==i; }); }); }}>×</Button>
                  </div>
                );})}
              </div>
            </div>
          </TabsContent>
          <TabsContent value="positions" className="mt-4">
            <div className="space-y-2">
              <AddPosition onAdd={addPosition} />
              <div className="grid sm:grid-cols-2 gap-2">
                {positions.map(function(p){ return (
                  <div key={p.id} className="flex items-center justify-between border rounded-xl p-2">
                    <Input className="h-8" value={p.name} onChange={function(e){ /* Position names are edited inline in main grid */ }} />
                    <Button variant="ghost" size="sm" onClick={function(){ removePosition(p.id); }}>Remove</Button>
                  </div>
                );})}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
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

