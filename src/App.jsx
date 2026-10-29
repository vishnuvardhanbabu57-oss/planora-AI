import { useEffect, useRef, useState } from 'react'
import AuthScreen from './components/AuthScreen'
import { supabase } from './lib/supabase'
import './App.css'

const priorities = ['High', 'Medium', 'Low']
const taskColumns = 'id, user_id, title, description, due_date, priority, status, estimated_minutes, created_at'

const navigation = [
  { label: 'Dashboard', icon: 'grid' },
  { label: 'My Tasks', icon: 'check' },
  { label: 'Calendar', icon: 'calendar' },
  { label: 'Planner', icon: 'focus' },
  { label: 'Study Planner', icon: 'book' },
  { label: 'Goals', icon: 'target' },
  { label: 'AI Assistant', icon: 'sparkles' },
  { label: 'Analytics', icon: 'chart' },
]

function mapDatabaseTask(row) {
  return {
    id: row.id,
    title: row.title,
    detail: row.description ?? '',
    dueDate: row.due_date ?? '',
    estimatedMinutes: row.estimated_minutes ?? 30,
    priority: row.priority.charAt(0).toUpperCase() + row.priority.slice(1),
    completed: row.status === 'completed',
    completedAt: null,
  }
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDueDate(dateString) {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}

function formatPlanStartTime(totalMinutes) {
  const dayOffset = Math.floor(totalMinutes / (24 * 60))
  const minutesInDay = totalMinutes % (24 * 60)
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(2000, 0, 1, Math.floor(minutesInDay / 60), minutesInDay % 60))

  return dayOffset > 0 ? `${time} · Day ${dayOffset + 1}` : time
}

function createDailyPlan(tasks) {
  const priorityOrder = { High: 0, Medium: 1, Low: 2 }
  const today = getLocalDateString()
  const urgency = (dueDate) => {
    if (!dueDate) return 0
    if (dueDate < today) return 5
    if (dueDate === today) return 4
    if (dueDate <= getDateAfterDays(today, 2)) return 3
    if (dueDate <= getDateAfterDays(today, 7)) return 2
    if (dueDate <= getDateAfterDays(today, 14)) return 1
    return 0
  }
  const sortedTasks = [...tasks].sort((first, second) => {
    const firstScore = (priorityOrder[first.priority] === 0 ? 3 : priorityOrder[first.priority] === 1 ? 2 : 1)
      + urgency(first.dueDate) * 2
    const secondScore = (priorityOrder[second.priority] === 0 ? 3 : priorityOrder[second.priority] === 1 ? 2 : 1)
      + urgency(second.dueDate) * 2
    if (firstScore !== secondScore) return secondScore - firstScore

    const firstDueDate = first.dueDate || '9999-12-31'
    const secondDueDate = second.dueDate || '9999-12-31'
    if (firstDueDate !== secondDueDate) return firstDueDate.localeCompare(secondDueDate)

    return Number(first.estimatedMinutes) - Number(second.estimatedMinutes)
  })

  let nextStartMinute = 9 * 60
  return sortedTasks.map((task) => {
    const duration = Number(task.estimatedMinutes) || 30
    const plannedTask = { task, startMinute: nextStartMinute, duration }
    nextStartMinute += duration
    return plannedTask
  })
}

function createAssistantSuggestions(question, tasks) {
  const priorityWeight = { High: 3, Medium: 2, Low: 1 }
  const today = getLocalDateString()
  const examFocus = /\b(exam|exam prep|study|revision|revise)\b/i.test(question)
  const weeklyFocus = /\b(week|weekly|this week)\b/i.test(question)

  const orderedTasks = [...tasks].sort((first, second) => {
    const firstDue = first.dueDate || '9999-12-31'
    const secondDue = second.dueDate || '9999-12-31'
    const firstUrgency = firstDue < today ? 4 : firstDue === today ? 3 : firstDue <= getDateAfterDays(today, 3) ? 2 : firstDue <= getDateAfterDays(today, 7) ? 1 : 0
    const secondUrgency = secondDue < today ? 4 : secondDue === today ? 3 : secondDue <= getDateAfterDays(today, 3) ? 2 : secondDue <= getDateAfterDays(today, 7) ? 1 : 0
    const firstScore = priorityWeight[first.priority] * 2 + firstUrgency
    const secondScore = priorityWeight[second.priority] * 2 + secondUrgency

    return secondScore - firstScore
      || firstDue.localeCompare(secondDue)
      || second.estimatedMinutes - first.estimatedMinutes
  })

  const largestTask = tasks.reduce((largest, task) => (
    !largest || task.estimatedMinutes > largest.estimatedMinutes ? task : largest
  ), null)
  const totalMinutes = tasks.reduce((total, task) => total + task.estimatedMinutes, 0)

  return {
    examFocus,
    weeklyFocus,
    orderedTasks,
    largestTask,
    totalMinutes,
  }
}

function getDateAfterDays(dateString, days) {
  const [year, month, day] = dateString.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + days)
  return getLocalDateString(date)
}

function getWeekDates() {
  const today = new Date()
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const mondayOffset = (monday.getDay() + 6) % 7
  monday.setDate(monday.getDate() - mondayOffset)

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)
    return date
  })
}

function getCalendarMonthDates(monthDate) {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
  const gridStart = new Date(firstDay.getFullYear(), firstDay.getMonth(), 1 - firstDay.getDay())
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index)
    return { date, dateString: getLocalDateString(date) }
  })
}

function Icon({ name, size = 20 }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></>,
    check: <><path d="m5 12 4 4L19 6" /><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></>,
    target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
    sparkles: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" /><path d="m19 14 1.1 2.9L23 18l-2.9 1.1L19 22l-1.1-2.9L15 18l2.9-1.1L19 14Z" /></>,
    chart: <><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-5 5" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    arrow: <><path d="M7 17 17 7M7 7h10v10" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    focus: <><path d="M4 8V5a1 1 0 0 1 1-1h3m8 0h3a1 1 0 0 1 1 1v3m0 8v3a1 1 0 0 1-1 1h-3m-8 0H5a1 1 0 0 1-1-1v-3" /><circle cx="12" cy="12" r="3" /></>,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z" /><path d="M4 5.5v16M8 7h8m-8 4h8" /></>,
    activity: <><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
    trash: <><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6" /></>,
  }

  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  )
}

function DashboardApp({ session }) {
  const [tasks, setTasks] = useState([])
  const [tasksLoading, setTasksLoading] = useState(true)
  const [taskError, setTaskError] = useState('')
  const [tasksLoadError, setTasksLoadError] = useState('')
  const [activeNav, setActiveNav] = useState('Dashboard')
  const [menuOpen, setMenuOpen] = useState(false)
  const [taskDialog, setTaskDialog] = useState(null)
  const [generatedPlan, setGeneratedPlan] = useState(null)
  const [statusFilter, setStatusFilter] = useState('All')
  const [priorityFilter, setPriorityFilter] = useState('All')
  const [taskSearch, setTaskSearch] = useState('')
  const [taskBusy, setTaskBusy] = useState(false)
  const [assistantPrompt, setAssistantPrompt] = useState('')
  const [assistantMessages, setAssistantMessages] = useState([])
  const [assistantLoading, setAssistantLoading] = useState(false)
  const [assistantError, setAssistantError] = useState('')
  const [studySubjects, setStudySubjects] = useState([])
  const [studySessions, setStudySessions] = useState([])
  const [studyLoading, setStudyLoading] = useState(true)
  const [studyLoadError, setStudyLoadError] = useState('')
  const [studyActionError, setStudyActionError] = useState('')
  const [studyBusy, setStudyBusy] = useState(false)
  const [studySubjectDraft, setStudySubjectDraft] = useState('')
  const [reminderError, setReminderError] = useState('')
  const [studySessionDraft, setStudySessionDraft] = useState(() => ({
    subjectId: '',
    topic: '',
    sessionDate: getLocalDateString(),
    startTime: '09:00',
    estimatedMinutes: 45,
  }))
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(getLocalDateString())
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const currentDate = new Date()
    return new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
  })
  const [reminderPermission, setReminderPermission] = useState(() => (
    typeof window !== 'undefined' && 'Notification' in window ? window.Notification.permission : 'unsupported'
  ))
  const notifiedReminderIds = useRef(new Set())
  const [connectionAttempt, setConnectionAttempt] = useState(0)
  const [connectionStatus, setConnectionStatus] = useState({ state: 'checking', message: 'Checking database…' })
  const [signOutError, setSignOutError] = useState('')

  useEffect(() => {
    let active = true

    async function fetchTasks() {
      const { data, error } = await supabase
        .from('tasks')
        .select(taskColumns)
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })

      if (!active) return

      if (error) {
        setTasksLoadError(`Could not load your tasks: ${error.message}`)
        setTaskError(`Could not load your tasks: ${error.message}`)
      } else {
        setTasksLoadError('')
        setTasks(data.map(mapDatabaseTask))
      }

      setTasksLoading(false)
    }

    fetchTasks().catch((error) => {
      console.error('Unable to load Planora tasks:', error)
      if (!active) return
      setTasksLoadError('Could not load your tasks. Please check your connection and try again.')
      setTaskError('Could not load your tasks. Please check your connection and try again.')
      setTasksLoading(false)
    })

    return () => {
      active = false
    }
  }, [session.user.id])

  useEffect(() => {
    let active = true

    async function fetchStudyData() {
      setStudyLoading(true)
      setStudyLoadError('')
      const [subjectsResult, sessionsResult] = await Promise.all([
        supabase
          .from('study_subjects')
          .select('id, user_id, name, created_at')
          .eq('user_id', session.user.id)
          .order('name'),
        supabase
          .from('study_sessions')
          .select('id, user_id, subject_id, topic, session_date, start_time, estimated_minutes, completed, created_at')
          .eq('user_id', session.user.id)
          .order('session_date')
          .order('start_time', { ascending: true, nullsFirst: true }),
      ])

      if (!active) return
      if (subjectsResult.error || sessionsResult.error) {
        const error = subjectsResult.error || sessionsResult.error
        setStudyLoadError(`Could not load study planner data: ${error.message}. Apply the study planner migration to enable this feature.`)
      } else {
        setStudySubjects(subjectsResult.data)
        setStudySessions(sessionsResult.data)
        setStudySessionDraft((current) => ({
          ...current,
          subjectId: current.subjectId || (subjectsResult.data[0] ? String(subjectsResult.data[0].id) : ''),
        }))
      }
      setStudyLoading(false)
    }

    fetchStudyData().catch((error) => {
      console.error('Unable to load Planora study planner:', error)
      if (!active) return
      setStudyLoadError('Could not load study planner data. Please check your connection and apply the study planner migration.')
      setStudyLoading(false)
    })

    return () => {
      active = false
    }
  }, [session.user.id])

  useEffect(() => {
    if (tasksLoading || typeof window === 'undefined' || !('Notification' in window)) return undefined

    function remindAboutDueTasks() {
      if (window.Notification.permission !== 'granted') return
      const todayDate = getLocalDateString()
      const dueToday = tasks.filter((task) => !task.completed && task.dueDate === todayDate)
      const unremindedTasks = dueToday.filter((task) => !notifiedReminderIds.current.has(task.id))
      if (unremindedTasks.length === 0) return

      new window.Notification('Planora · Tasks due today', {
        body: unremindedTasks.slice(0, 3).map((task) => task.title).join(', ')
          + (unremindedTasks.length > 3 ? ` and ${unremindedTasks.length - 3} more` : ''),
        tag: `planora-due-${todayDate}`,
      })
      unremindedTasks.forEach((task) => notifiedReminderIds.current.add(task.id))
    }

    remindAboutDueTasks()
    const intervalId = window.setInterval(remindAboutDueTasks, 15 * 60 * 1000)
    return () => window.clearInterval(intervalId)
  }, [tasks, tasksLoading, reminderPermission])

  useEffect(() => {
    let active = true

    supabase
      .from('tasks')
      .select('id')
      .eq('user_id', session.user.id)
      .limit(1)
      .then(({ error }) => {
        if (!active) return
        setConnectionStatus(error
          ? { state: 'error', message: 'Database connection failed. Check your Supabase setup.' }
          : { state: 'connected', message: 'Supabase connected' })
      })
      .catch((error) => {
        console.error('Supabase connection test failed:', error)
        if (active) setConnectionStatus({ state: 'error', message: 'Database connection failed. Check your Supabase setup.' })
      })

    return () => {
      active = false
    }
  }, [session.user.id, connectionAttempt])

  useEffect(() => {
    if (!taskDialog) return undefined

    function closeOnEscape(event) {
      if (event.key === 'Escape') setTaskDialog(null)
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [taskDialog])

  const completedTasks = tasks.filter((task) => task.completed).length
  const pendingTasks = tasks.length - completedTasks
  const incompleteTasks = tasks.filter((task) => !task.completed)
  const todayDate = getLocalDateString()
  const overdueTasks = incompleteTasks.filter((task) => task.dueDate && task.dueDate < todayDate)
  const dueSoonTasks = incompleteTasks.filter((task) => task.dueDate && task.dueDate >= todayDate && task.dueDate <= getDateAfterDays(todayDate, 2))
  const productivity = tasks.length === 0 ? 0 : Math.round((completedTasks / tasks.length) * 100)
  const today = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date())
  const weekDates = getWeekDates()
  const weeklyCounts = weekDates.map((date) => {
    const count = tasks.filter((task) => {
      if (!task.completedAt) return false
      const completedDate = new Date(task.completedAt)
      return completedDate.getFullYear() === date.getFullYear()
        && completedDate.getMonth() === date.getMonth()
        && completedDate.getDate() === date.getDate()
    }).length
    return { day: new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date), count }
  })
  const weeklyCompleted = weeklyCounts.reduce((total, day) => total + day.count, 0)
  const weeklyProductivity = tasks.length === 0 ? 0 : Math.round((weeklyCompleted / tasks.length) * 100)
  const filteredTasks = tasks.filter((task) => {
    const matchesStatus = statusFilter === 'All'
      || (statusFilter === 'Completed' ? task.completed : !task.completed)
    const matchesPriority = priorityFilter === 'All' || task.priority === priorityFilter
    const matchesSearch = `${task.title} ${task.detail}`.toLowerCase().includes(taskSearch.trim().toLowerCase())
    return matchesStatus && matchesPriority && matchesSearch
  })

  async function toggleTask(taskId) {
    const task = tasks.find((currentTask) => currentTask.id === taskId)
    if (!task) return

    setTaskBusy(true)
    setTaskError('')
    try {
      const { data, error } = await supabase
        .from('tasks')
        .update({ status: task.completed ? 'pending' : 'completed' })
        .eq('id', taskId)
        .eq('user_id', session.user.id)
        .select(taskColumns)
        .single()

      if (error) throw error
      setTasks((currentTasks) => currentTasks.map((currentTask) => (
        currentTask.id === taskId ? mapDatabaseTask(data) : currentTask
      )))
      setGeneratedPlan(null)
    } catch (error) {
      console.error('Unable to update Planora task:', error)
      setTaskError(`Could not update the task: ${error.message}`)
    } finally {
      setTaskBusy(false)
    }
  }

  function navigateTo(label) {
    setActiveNav(label)
    setMenuOpen(false)
  }

  function openTaskDialog(task = null) {
    setTaskDialog(task
      ? { id: task.id, title: task.title, detail: task.detail, dueDate: task.dueDate, estimatedMinutes: task.estimatedMinutes, priority: task.priority }
      : { id: null, title: '', detail: '', dueDate: '', estimatedMinutes: 30, priority: 'Medium' })
  }

  async function saveTask(event) {
    event.preventDefault()
    const title = taskDialog.title.trim()
    if (!title) return

    setTaskBusy(true)
    setTaskError('')
    const values = {
      title,
      description: taskDialog.detail.trim(),
      due_date: taskDialog.dueDate || null,
      estimated_minutes: Number(taskDialog.estimatedMinutes),
      priority: taskDialog.priority.toLowerCase(),
    }

    try {
      const result = taskDialog.id !== null
        ? await supabase
          .from('tasks')
          .update(values)
          .eq('id', taskDialog.id)
          .eq('user_id', session.user.id)
          .select(taskColumns)
          .single()
        : await supabase
          .from('tasks')
          .insert({ ...values, user_id: session.user.id })
          .select(taskColumns)
          .single()

      if (result.error) throw result.error
      const savedTask = mapDatabaseTask(result.data)
      setTasks((currentTasks) => taskDialog.id !== null
        ? currentTasks.map((task) => task.id === taskDialog.id ? savedTask : task)
        : [savedTask, ...currentTasks])
      setGeneratedPlan(null)
      setTaskDialog(null)
    } catch (error) {
      console.error('Unable to save Planora task:', error)
      setTaskError(`Could not save the task: ${error.message}`)
    } finally {
      setTaskBusy(false)
    }
  }

  async function deleteTask(taskId) {
    setTaskBusy(true)
    setTaskError('')

    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId)
        .eq('user_id', session.user.id)

      if (error) throw error
      setTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId))
      setGeneratedPlan(null)
    } catch (error) {
      console.error('Unable to delete Planora task:', error)
      setTaskError(`Could not delete the task: ${error.message}`)
    } finally {
      setTaskBusy(false)
    }
  }

  async function addStudySubject(event) {
    event.preventDefault()
    const name = studySubjectDraft.trim()
    if (!name) return

    setStudyBusy(true)
    setStudyActionError('')
    try {
      const { data, error } = await supabase
        .from('study_subjects')
        .insert({ user_id: session.user.id, name })
        .select('id, user_id, name, created_at')
        .single()

      if (error) throw error
      setStudySubjects((current) => [...current, data].sort((first, second) => first.name.localeCompare(second.name)))
      setStudySessionDraft((current) => ({ ...current, subjectId: String(data.id) }))
      setStudySubjectDraft('')
    } catch (error) {
      console.error('Unable to add Planora study subject:', error)
      setStudyActionError(`Could not add the subject: ${error.message}`)
    } finally {
      setStudyBusy(false)
    }
  }

  async function addStudySession(event) {
    event.preventDefault()
    if (!studySessionDraft.subjectId) {
      setStudyActionError('Add a subject before scheduling a study session.')
      return
    }

    setStudyBusy(true)
    setStudyActionError('')
    try {
      const { data, error } = await supabase
        .from('study_sessions')
        .insert({
          user_id: session.user.id,
          subject_id: Number(studySessionDraft.subjectId),
          topic: studySessionDraft.topic.trim(),
          session_date: studySessionDraft.sessionDate,
          start_time: studySessionDraft.startTime || null,
          estimated_minutes: Number(studySessionDraft.estimatedMinutes),
        })
        .select('id, user_id, subject_id, topic, session_date, start_time, estimated_minutes, completed, created_at')
        .single()

      if (error) throw error
      setStudySessions((current) => [...current, data].sort((first, second) => (
        first.session_date.localeCompare(second.session_date)
        || (first.start_time || '').localeCompare(second.start_time || '')
      )))
      setStudySessionDraft((current) => ({ ...current, topic: '' }))
    } catch (error) {
      console.error('Unable to schedule Planora study session:', error)
      setStudyActionError(`Could not schedule the study session: ${error.message}`)
    } finally {
      setStudyBusy(false)
    }
  }

  async function toggleStudySession(sessionToUpdate) {
    setStudyBusy(true)
    setStudyActionError('')
    try {
      const { data, error } = await supabase
        .from('study_sessions')
        .update({ completed: !sessionToUpdate.completed })
        .eq('id', sessionToUpdate.id)
        .eq('user_id', session.user.id)
        .select('id, user_id, subject_id, topic, session_date, start_time, estimated_minutes, completed, created_at')
        .single()

      if (error) throw error
      setStudySessions((current) => current.map((item) => item.id === data.id ? data : item))
    } catch (error) {
      console.error('Unable to update Planora study session:', error)
      setStudyActionError(`Could not update the study session: ${error.message}`)
    } finally {
      setStudyBusy(false)
    }
  }

  async function enableDueReminders() {
    setReminderError('')
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setReminderPermission('unsupported')
      return
    }

    try {
      setReminderPermission('requesting')
      const permission = await window.Notification.requestPermission()
      setReminderPermission(permission)
    } catch (error) {
      console.error('Unable to enable Planora browser reminders:', error)
      setReminderError('Browser notifications could not be enabled. Check your browser settings and try again.')
    }
  }

  async function signOut() {
    setSignOutError('')
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    } catch (error) {
      console.error('Unable to sign out:', error)
      setSignOutError(`Could not sign out: ${error.message}`)
    }
  }

  function retryConnectionTest() {
    setConnectionStatus({ state: 'checking', message: 'Checking database…' })
    setConnectionAttempt((attempt) => attempt + 1)
  }

  function generateDailyPlan() {
    setGeneratedPlan(createDailyPlan(tasks.filter((task) => !task.completed)))
  }

  function renderDailyPlan() {
    if (tasksLoading) {
      return <p className="empty-tasks" role="status">Loading your tasks…</p>
    }

    const incompleteTasks = tasks.filter((task) => !task.completed)
    if (incompleteTasks.length === 0) {
      return (
        <div className="planner-empty-state">
          <span className="planner-empty-icon"><Icon name="check" size={22} /></span>
          <h3>You&apos;re all caught up</h3>
          <p>There are no incomplete tasks to plan. Add a task whenever something new is on your mind.</p>
          <button className="secondary-button" onClick={() => openTaskDialog()}>Add a task</button>
        </div>
      )
    }

    if (!generatedPlan) {
      return (
        <div className="planner-empty-state">
          <span className="planner-empty-icon"><Icon name="calendar" size={22} /></span>
          <h3>Your day, thoughtfully arranged</h3>
          <p>Generate a suggested order for your {incompleteTasks.length} incomplete {incompleteTasks.length === 1 ? 'task' : 'tasks'}.</p>
        </div>
      )
    }

    return (
      <ol className="daily-plan-list">
        {generatedPlan.map(({ task, startMinute, duration }, index) => (
          <li className="daily-plan-item" key={task.id}>
            <span className="daily-plan-index">{String(index + 1).padStart(2, '0')}</span>
            <span className="daily-plan-time">{formatPlanStartTime(startMinute)}</span>
            <span className="daily-plan-copy">
              <strong>{task.title}</strong>
              <small>{task.detail || 'No notes'}</small>
            </span>
            <span className="daily-plan-meta">
              <span className={`priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
              <span>{duration} min</span>
              {task.dueDate && <span>Due {formatDueDate(task.dueDate)}</span>}
            </span>
          </li>
        ))}
      </ol>
    )
  }

  async function submitAssistantQuestion(event) {
    event.preventDefault()
    const question = assistantPrompt.trim()
    if (!question || assistantLoading || tasksLoadError) return

    setAssistantError('')
    setAssistantLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('plan-assistant', {
        body: { question },
      })

      if (error) {
        let errorPayload = null
        if (error.context instanceof Response) {
          try {
            errorPayload = await error.context.clone().json()
          } catch {
            errorPayload = null
          }
        }

        if (errorPayload?.code === 'AI_NOT_CONFIGURED') {
          const suggestions = createAssistantSuggestions(question, tasks.filter((task) => !task.completed))
          setAssistantMessages((messages) => [...messages, {
            id: Date.now(),
            question,
            mode: 'fallback',
            suggestions,
          }])
        } else {
          throw new Error(errorPayload?.error || 'The assistant service could not respond. Please try again.')
        }
      } else if ((data?.mode === 'ai' || data?.mode === 'fallback') && typeof data.advice === 'string' && data.advice.trim()) {
        setAssistantMessages((messages) => [...messages, {
          id: Date.now(),
          question,
          mode: data.mode === 'ai' ? 'ai' : 'fallback-advice',
          answer: data.advice.trim(),
        }])
      } else {
        throw new Error('The assistant returned an unexpected response. Please try again.')
      }

      setAssistantPrompt('')
    } catch (error) {
      console.error('Unable to prepare Planora assistant suggestions:', error)
      setAssistantError(error.message || 'The assistant could not respond. Please try again.')
    } finally {
      setAssistantLoading(false)
    }
  }

  function renderAssistantPage() {
    const incompleteTasks = tasks.filter((task) => !task.completed)

    return (
      <article className="panel assistant-chat-panel">
        <div className="assistant-mode-note">
          <span className="assistant-mode-icon"><Icon name="sparkles" size={16} /></span>
          <span><strong>Planning through a secure server-side function</strong><small>Your question and incomplete task details are sent to OpenAI when configured. Rule-based advice is used if the AI provider is unavailable. No task is changed.</small></span>
        </div>

        {tasksLoading ? (
          <p className="assistant-status" role="status">Loading your tasks so the assistant can use your current plan…</p>
        ) : tasksLoadError ? (
          <p className="assistant-error" role="alert">{tasksLoadError} Assistant suggestions are unavailable until your tasks load.</p>
        ) : (
          <>
            <div className="assistant-conversation" aria-live="polite">
              {assistantMessages.length === 0 ? (
                <div className="assistant-welcome">
                  <h2>What would you like help planning?</h2>
                  {incompleteTasks.length > 0 ? (
                    <p>I can help prioritize your {incompleteTasks.length} incomplete {incompleteTasks.length === 1 ? 'task' : 'tasks'} and suggest ways to break down larger work. I won&apos;t save or change anything.</p>
                  ) : (
                    <p>You have no incomplete tasks right now. You can still ask for general planning advice; add tasks to get suggestions grounded in your task list.</p>
                  )}
                  <div className="assistant-examples">
                    <button type="button" onClick={() => setAssistantPrompt('Help me plan my exam preparation this week.')}>Help me plan my exam preparation this week</button>
                    <button type="button" onClick={() => setAssistantPrompt('Which tasks should I focus on first?')}>Which tasks should I focus on first?</button>
                  </div>
                </div>
              ) : (
                assistantMessages.map(({ id, question, mode, answer, suggestions }) => (
                  <section className="assistant-response" key={id}>
                    <p className="assistant-question">{question}</p>
                    <div className="assistant-advice">
                      <span className="assistant-advice-label">
                        <Icon name="sparkles" size={14} />
                        {mode === 'ai' ? 'AI-generated advice · Suggestions only' : mode === 'fallback-advice' ? 'Rule-based advice · Suggestions only' : 'Rule-based fallback · AI provider not configured'}
                      </span>
                      {mode === 'ai' || mode === 'fallback-advice' ? (
                        <p className="assistant-ai-answer">{answer}</p>
                      ) : suggestions.orderedTasks.length > 0 ? (
                        <>
                          <p>
                            You have {suggestions.orderedTasks.length} incomplete {suggestions.orderedTasks.length === 1 ? 'task' : 'tasks'} totalling about {Math.floor(suggestions.totalMinutes / 60)}h {suggestions.totalMinutes % 60}m. Use this as a suggested focus order:
                          </p>
                          <ol className="assistant-task-priorities">
                            {suggestions.orderedTasks.slice(0, 6).map((task) => (
                              <li key={task.id}>
                                <strong>{task.title}</strong>
                                <span>{task.priority} priority · {task.estimatedMinutes} min{task.dueDate ? ` · Due ${formatDueDate(task.dueDate)}` : ' · No due date'}</span>
                              </li>
                            ))}
                          </ol>
                          {suggestions.orderedTasks.length > 6 && <p className="assistant-more-tasks">…and {suggestions.orderedTasks.length - 6} more incomplete tasks.</p>}
                          {suggestions.largestTask && (
                            <div className="assistant-breakdown">
                              <strong>Break down: {suggestions.largestTask.title} ({suggestions.largestTask.estimatedMinutes} min)</strong>
                              <ol>
                                {suggestions.examFocus ? (
                                  <>
                                    <li>Choose one topic or chapter and review it in a focused block.</li>
                                    <li>Try practice questions on that topic, then check your answers.</li>
                                    <li>Note the gaps to revisit in your next study block.</li>
                                  </>
                                ) : (
                                  <>
                                    <li>Define one small, concrete outcome for your first focus block.</li>
                                    <li>Work for about 25 minutes, then take a short break before continuing.</li>
                                    <li>Review what remains and choose the next manageable step.</li>
                                  </>
                                )}
                              </ol>
                              <small>These are ideas only; no subtasks have been created.</small>
                            </div>
                          )}
                          <p className="assistant-time-advice">
                            {suggestions.weeklyFocus
                              ? 'For this week, spread the highest-priority and soonest-due work across your available days. Use focused blocks that fit the estimates, and leave some time before each deadline to review.'
                              : 'Reserve your clearest focus time for the highest-priority or soonest-due work. Use the estimates to choose a realistic block, and add a short break between longer sessions.'}
                          </p>
                        </>
                      ) : (
                        <p>No incomplete tasks are available as context. Add tasks in My Tasks for personalized prioritization; meanwhile, break any large goal into a first small action, a focused work block, and a review.</p>
                      )}
                      <p className="assistant-confirmation">Suggestions only. Your saved tasks and due dates have not been changed.</p>
                    </div>
                  </section>
                ))
              )}
              {assistantLoading && <p className="assistant-status" role="status">Preparing suggestions from your task list…</p>}
            </div>
            {assistantError && <p className="assistant-error" role="alert">{assistantError}</p>}
            <form className="assistant-question-form" onSubmit={submitAssistantQuestion}>
              <label className="visually-hidden" htmlFor="assistant-question">Ask the Planora assistant</label>
              <textarea
                id="assistant-question"
                rows="2"
                maxLength={500}
                value={assistantPrompt}
                onChange={(event) => setAssistantPrompt(event.target.value)}
                placeholder="Ask a planning question…"
                disabled={assistantLoading}
              />
              <button className="primary-button" type="submit" disabled={assistantLoading || !assistantPrompt.trim()}>
                {assistantLoading ? 'Thinking…' : 'Get suggestions'}
              </button>
            </form>
          </>
        )}
      </article>
    )
  }

  function renderTaskRows(showActions = false) {
    if (tasksLoading) {
      return <p className="empty-tasks" role="status">Loading your tasks…</p>
    }

    if (filteredTasks.length === 0) {
      return <p className="empty-tasks">No tasks match these filters. Try changing your search or add a task.</p>
    }

    return (
      <div className="task-list">
        {filteredTasks.map((task) => {
          const overdue = !task.completed && task.dueDate && task.dueDate < getLocalDateString()

          return (
            <div className={`task-row ${task.completed ? 'task-completed' : ''}`} key={task.id}>
              <label className="task-check">
                <input
                  type="checkbox"
                  checked={task.completed}
                  disabled={taskBusy}
                  onChange={() => toggleTask(task.id)}
                  aria-label={`${task.completed ? 'Mark incomplete' : 'Complete'}: ${task.title}`}
                />
                <span className="custom-checkbox"><Icon name="check" size={13} /></span>
              </label>
              <span className="task-copy">
                <strong>{task.title}</strong>
                <small>{task.detail || 'No notes'}</small>
                {task.dueDate && (
                  <small className={`task-due-date ${overdue ? 'task-due-overdue' : ''}`}>
                    {overdue ? 'Overdue' : 'Due'} · {formatDueDate(task.dueDate)}
                  </small>
                )}
              </span>
              <span className={`priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
              {showActions && (
                <span className="task-actions">
                  <button className="task-action" disabled={taskBusy} onClick={() => openTaskDialog(task)} aria-label={`Edit ${task.title}`} title="Edit task"><Icon name="edit" size={15} /></button>
                  <button className="task-action task-delete" disabled={taskBusy} onClick={() => deleteTask(task.id)} aria-label={`Delete ${task.title}`} title="Delete task"><Icon name="trash" size={15} /></button>
                </span>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  function renderSchedule() {
    const plannedTasks = createDailyPlan(incompleteTasks).slice(0, 4)
    if (tasksLoading) return <p className="empty-tasks" role="status">Loading your tasks…</p>
    if (plannedTasks.length === 0) {
      return <div className="schedule-empty"><Icon name="check" size={18} /><span>Your schedule is clear. Add a task to plan a focus block.</span></div>
    }

    return (
      <div className="schedule-list">
        {plannedTasks.map(({ task, startMinute, duration }, index) => (
          <div className="schedule-item" key={task.id}>
            <div className="event-time">{formatPlanStartTime(startMinute)}</div>
            <div className={`event-icon ${['lavender', 'peach', 'mint', 'blue'][index % 4]}`}><Icon name="focus" size={18} /></div>
            <div className="event-details">
              <strong>{task.title}</strong>
              <span>{task.priority} priority · {duration} min{task.dueDate ? ` · Due ${formatDueDate(task.dueDate)}` : ''}</span>
            </div>
            <span className="event-dot" />
          </div>
        ))}
      </div>
    )
  }

  function renderDashboardTaskCards() {
    if (tasksLoading) return <p className="empty-tasks" role="status">Loading your tasks…</p>

    const focusTasks = createDailyPlan(incompleteTasks).slice(0, 4)
    if (focusTasks.length === 0) return <p className="empty-tasks">You’re all caught up. Add a task whenever something new is on your mind.</p>

    return (
      <div className="dashboard-task-cards">
        {focusTasks.map(({ task }) => {
          const overdue = task.dueDate && task.dueDate < todayDate
          return (
            <article className="dashboard-task-card" key={task.id}>
              <label className="task-check">
                <input
                  type="checkbox"
                  checked={false}
                  disabled={taskBusy}
                  onChange={() => toggleTask(task.id)}
                  aria-label={`Complete: ${task.title}`}
                />
                <span className="custom-checkbox"><Icon name="check" size={13} /></span>
              </label>
              <div className="dashboard-task-copy">
                <strong>{task.title}</strong>
                <span>{task.detail || 'No notes added'}</span>
                <div className="dashboard-task-meta">
                  <span className={`priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
                  <span><Icon name="clock" size={13} /> {task.estimatedMinutes} min</span>
                  {task.dueDate && <span className={overdue ? 'dashboard-task-overdue' : ''}>{overdue ? 'Overdue' : 'Due'} · {formatDueDate(task.dueDate)}</span>}
                </div>
              </div>
            </article>
          )
        })}
      </div>
    )
  }

  function renderProductivityPanel() {
    const todayLabel = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(new Date())

    return (
      <article className="panel productivity-panel">
        <div className="panel-heading">
          <div><h2>Weekly productivity</h2><p>Completed tasks this week</p></div>
          <span className="period-label">This week</span>
        </div>
        <div className="weekly-total"><strong>{weeklyProductivity}%</strong><small>{weeklyCompleted} of {tasks.length} tasks completed this week</small></div>
        <div className="chart" aria-label={`Weekly task completion: ${weeklyCounts.map((day) => `${day.day} ${day.count}`).join(', ')}`}>
          {weeklyCounts.map((day) => {
            const height = tasks.length === 0 ? 0 : (day.count / tasks.length) * 100
            return (
              <div className="chart-column" key={day.day}>
                <span className="chart-count">{day.count}</span>
                <div className="chart-track"><span className={day.day === todayLabel ? 'chart-bar chart-bar-highlight' : 'chart-bar'} style={{ height: `${height}%` }} /></div>
                <span className="chart-day">{day.day}</span>
              </div>
            )
          })}
        </div>
        <div className="chart-legend"><span /><small>Tasks completed</small><span className="chart-legend-note">Overall completion <strong>{productivity}%</strong></span></div>
      </article>
    )
  }

  function renderDashboard() {
    const displayName = session.user.user_metadata?.full_name?.trim().split(/\s+/)[0]
      || (session.user.email || '').split('@')[0].replace(/[._-]+/g, ' ')
      || 'there'
    const timeOfDay = new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'

    return (
      <>
        <section className="welcome-row">
          <div>
            <div className="eyebrow"><span className="eyebrow-dot" /> YOUR DAY, AT A GLANCE</div>
            <h1>Good {timeOfDay}, {displayName} <span className="wave">✦</span></h1>
            <p className="welcome-subtitle">{overdueTasks.length ? `${overdueTasks.length} overdue ${overdueTasks.length === 1 ? 'task needs' : 'tasks need'} attention. Start with one manageable step.` : dueSoonTasks.length ? `${dueSoonTasks.length} ${dueSoonTasks.length === 1 ? 'task is' : 'tasks are'} due soon. Your next steps are ready when you are.` : 'A little progress each day adds up to big results.'}</p>
          </div>
          <button className="primary-button" onClick={() => openTaskDialog()}><Icon name="plus" size={18} /> Add new task</button>
        </section>

        <section className="stats-grid" aria-label="Task summary">
          <article className="stat-card">
            <div className="stat-top"><span className="stat-icon stat-purple"><Icon name="grid" size={19} /></span><span className="stat-trend neutral">All tasks</span></div>
            <div className="stat-value">{tasks.length}</div><div className="stat-label">Total tasks</div><div className="stat-foot">Across your task list</div>
          </article>
          <article className="stat-card">
            <div className="stat-top"><span className="stat-icon stat-green"><Icon name="check" size={19} /></span><span className="stat-trend positive">Done</span></div>
            <div className="stat-value">{completedTasks}</div><div className="stat-label">Completed</div><div className="stat-foot">Tasks marked complete</div>
          </article>
          <article className="stat-card">
            <div className="stat-top"><span className="stat-icon stat-orange"><Icon name="clock" size={19} /></span><span className={`stat-trend ${overdueTasks.length ? 'overdue-trend' : 'neutral'}`}>{overdueTasks.length ? 'Needs attention' : 'On track'}</span></div>
            <div className="stat-value">{overdueTasks.length}</div><div className="stat-label">Overdue tasks</div><div className="stat-foot">{pendingTasks} pending in total</div>
          </article>
          <article className="stat-card productivity-card">
            <div className="stat-top"><span className="stat-icon stat-blue"><Icon name="chart" size={19} /></span><span className="stat-trend positive">Based on tasks</span></div>
            <div className="stat-value">{productivity}<span className="stat-percent">%</span></div><div className="stat-label">Productivity</div>
            <div className="mini-progress" role="progressbar" aria-label="Task completion" aria-valuenow={productivity} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${productivity}%` }} /></div>
          </article>
        </section>

        <section className="content-grid">
          <article className="panel schedule-panel">
            <div className="panel-heading">
            <div><h2>Today&apos;s focus</h2><p>Priority and due-date based task blocks</p></div>
              <button className="text-button" onClick={() => navigateTo('Planner')}>Open planner <Icon name="arrow" size={15} /></button>
            </div>
            {renderSchedule()}
          </article>

          <article className="assistant-card">
            <div className="assistant-orbit orbit-one" /><div className="assistant-orbit orbit-two" />
            <div className="assistant-content">
              <span className="assistant-kicker"><Icon name="sparkles" size={15} /> RULE-BASED PLANNING SUPPORT</span>
              <h2>Make room for<br />what matters.</h2>
              <p>Get practical suggestions based on your task priorities, due dates, and estimated time.</p>
              <button onClick={() => navigateTo('AI Assistant')}>Ask the assistant <span><Icon name="arrow" size={16} /></span></button>
            </div>
            <div className="assistant-art" aria-hidden="true"><div className="art-sparkle sparkle-a">✦</div><div className="art-sparkle sparkle-b">✧</div><div className="art-sparkle sparkle-c">✦</div><div className="art-center"><Icon name="sparkles" size={34} /></div></div>
            <span className="assistant-footnote">No AI service connected.</span>
          </article>
        </section>

        <section className="lower-grid">
          <article className="panel tasks-panel">
            <div className="panel-heading">
            <div><h2>Next up <span className="heading-count">{pendingTasks}</span></h2><p>Your highest-priority and soonest-due work</p></div>
              <button className="text-button" onClick={() => navigateTo('My Tasks')}>See all <Icon name="arrow" size={15} /></button>
            </div>
            {renderDashboardTaskCards()}
          </article>
          {renderProductivityPanel()}
        </section>
        {renderReminderPanel()}
      </>
    )
  }

  function renderTasksPage() {
    return (
      <section className="page-section">
        <div className="welcome-row page-welcome">
          <div><div className="eyebrow"><span className="eyebrow-dot" /> YOUR PERSONAL WORKSPACE</div><h1>My tasks</h1><p className="welcome-subtitle">Keep track of everything you want to get done.</p></div>
          <button className="primary-button" onClick={() => openTaskDialog()}><Icon name="plus" size={18} /> Add new task</button>
        </div>
        <section className="stats-grid compact-stats" aria-label="Task summary">
          <article className="stat-card"><div className="stat-value">{tasks.length}</div><div className="stat-label">Total tasks</div></article>
          <article className="stat-card"><div className="stat-value">{completedTasks}</div><div className="stat-label">Completed</div></article>
          <article className="stat-card"><div className="stat-value">{pendingTasks}</div><div className="stat-label">Pending</div></article>
          <article className="stat-card"><div className="stat-value">{productivity}%</div><div className="stat-label">Complete</div><div className="mini-progress" role="progressbar" aria-label="Task completion" aria-valuenow={productivity} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${productivity}%` }} /></div></article>
        </section>
        <article className="panel task-manager-panel">
          <div className="panel-heading"><div><h2>All tasks</h2><p>{filteredTasks.length} of {tasks.length} tasks shown</p></div></div>
          <div className="task-filters">
            <label className="task-search-label"><span className="visually-hidden">Search tasks</span><Icon name="search" size={16} /><input value={taskSearch} onChange={(event) => setTaskSearch(event.target.value)} placeholder="Search tasks" /></label>
            <label className="filter-label">Status
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option>All</option><option>Pending</option><option>Completed</option>
              </select>
            </label>
            <label className="filter-label">Priority
              <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
                <option>All</option>{priorities.map((priority) => <option key={priority}>{priority}</option>)}
              </select>
            </label>
          </div>
          {renderTaskRows(true)}
        </article>
      </section>
    )
  }

  function renderCalendarPage() {
    const calendarDays = getCalendarMonthDates(calendarMonth)
    const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(calendarMonth)
    const dayLabels = Array.from({ length: 7 }, (_, index) => (
      new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(new Date(2024, 0, index + 7))
    ))
    const tasksOnSelectedDate = tasks.filter((task) => task.dueDate === selectedCalendarDate)
    const sessionsOnSelectedDate = studySessions.filter((studySession) => studySession.session_date === selectedCalendarDate)
    const selectedDateLabel = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(`${selectedCalendarDate}T12:00:00`))

    return (
      <div className="calendar-layout">
        <article className="panel calendar-panel">
          <div className="calendar-heading">
            <div><h2>{monthLabel}</h2><p>Tasks and study sessions by date</p></div>
            <div className="calendar-month-controls">
              <button type="button" className="calendar-nav-button" aria-label="Previous month" onClick={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
              <button type="button" className="calendar-today-button" onClick={() => { const currentDate = new Date(); setCalendarMonth(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)); setSelectedCalendarDate(getLocalDateString()) }}>Today</button>
              <button type="button" className="calendar-nav-button" aria-label="Next month" onClick={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
            </div>
          </div>
          <div className="calendar-grid" role="group" aria-label={`${monthLabel} calendar`}>
            {dayLabels.map((day) => <span className="calendar-weekday" key={day}>{day}</span>)}
            {calendarDays.map(({ date, dateString }) => {
              const dayTasks = tasks.filter((task) => task.dueDate === dateString)
              const daySessions = studySessions.filter((studySession) => studySession.session_date === dateString)
              const isSelected = selectedCalendarDate === dateString
              const isToday = todayDate === dateString
              return (
                <button
                  type="button"
                  className={`calendar-day ${date.getMonth() === calendarMonth.getMonth() ? '' : 'calendar-day-outside'} ${isSelected ? 'calendar-day-selected' : ''} ${isToday ? 'calendar-day-today' : ''}`}
                  key={dateString}
                  aria-label={`${dateString}: ${dayTasks.length} due ${dayTasks.length === 1 ? 'task' : 'tasks'}, ${daySessions.length} ${daySessions.length === 1 ? 'study session' : 'study sessions'}`}
                  aria-pressed={isSelected}
                  onClick={() => {
                    setSelectedCalendarDate(dateString)
                    if (date.getMonth() !== calendarMonth.getMonth()) {
                      setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1))
                    }
                  }}
                >
                  <span className="calendar-day-number">{date.getDate()}</span>
                  <span className="calendar-day-markers" aria-hidden="true">
                    {dayTasks.length > 0 && <i className="calendar-task-marker" />}
                    {daySessions.length > 0 && <i className="calendar-study-marker" />}
                  </span>
                  {(dayTasks.length + daySessions.length > 0) && <small>{dayTasks.length + daySessions.length}</small>}
                </button>
              )
            })}
          </div>
          <div className="calendar-legend"><span><i className="calendar-task-marker" /> Due tasks</span><span><i className="calendar-study-marker" /> Study sessions</span></div>
        </article>

        <article className="panel calendar-agenda-panel">
          <div className="panel-heading">
            <div><h2>Day agenda</h2><p>{selectedDateLabel}</p></div>
            <button type="button" className="text-button" onClick={() => navigateTo('Study Planner')}>Plan study time <Icon name="arrow" size={15} /></button>
          </div>
          {tasksOnSelectedDate.length === 0 && sessionsOnSelectedDate.length === 0 ? (
            <p className="empty-tasks">Nothing scheduled for this date yet.</p>
          ) : (
            <div className="calendar-agenda-list">
              {tasksOnSelectedDate.map((task) => (
                <div className={`calendar-agenda-item ${task.completed ? 'calendar-agenda-complete' : ''}`} key={`task-${task.id}`}>
                  <span className="calendar-agenda-marker calendar-task-marker" />
                  <span><strong>{task.title}</strong><small>Due task · {task.priority} priority · {task.estimatedMinutes} min{task.completed ? ' · Completed' : ''}</small></span>
                </div>
              ))}
              {sessionsOnSelectedDate.map((studySession) => {
                const subject = studySubjects.find((item) => item.id === studySession.subject_id)
                return (
                  <div className={`calendar-agenda-item ${studySession.completed ? 'calendar-agenda-complete' : ''}`} key={`study-${studySession.id}`}>
                    <span className="calendar-agenda-marker calendar-study-marker" />
                    <span><strong>{studySession.topic}</strong><small>{subject?.name || 'Study'} · {studySession.start_time?.slice(0, 5) || 'Time not set'} · {studySession.estimated_minutes} min{studySession.completed ? ' · Completed' : ''}</small></span>
                  </div>
                )
              })}
            </div>
          )}
        </article>
      </div>
    )
  }

  function renderStudyPlannerPage() {
    const sortedSessions = [...studySessions].sort((first, second) => (
      first.session_date.localeCompare(second.session_date)
      || (first.start_time || '').localeCompare(second.start_time || '')
    ))

    return (
      <div className="study-planner-layout">
        {studyLoadError && <p className="task-error" role="alert">{studyLoadError}</p>}
        {studyActionError && <p className="task-error" role="alert">{studyActionError}</p>}
        {studyLoading ? (
          <p className="empty-tasks" role="status">Loading your study planner…</p>
        ) : !studyLoadError ? (
          <>
            <article className="panel study-setup-panel">
              <div className="panel-heading"><div><h2>Subjects</h2><p>Create a subject to organize your study sessions.</p></div></div>
              <form className="study-subject-form" onSubmit={addStudySubject}>
                <label className="visually-hidden" htmlFor="study-subject-name">Subject name</label>
                <input id="study-subject-name" value={studySubjectDraft} maxLength={80} onChange={(event) => setStudySubjectDraft(event.target.value)} placeholder="e.g. Biology" required disabled={studyBusy} />
                <button type="submit" className="primary-button" disabled={studyBusy || !studySubjectDraft.trim()}><Icon name="plus" size={16} /> Add subject</button>
              </form>
              <div className="study-subject-list">
                {studySubjects.length ? studySubjects.map((subject) => <span className="study-subject-chip" key={subject.id}>{subject.name}</span>) : <p className="study-empty-note">Your subjects will appear here.</p>}
              </div>
            </article>

            <article className="panel study-session-form-panel">
              <div className="panel-heading"><div><h2>Schedule a study session</h2><p>Choose a subject, topic, date, and realistic duration.</p></div></div>
              <form className="study-session-form" onSubmit={addStudySession}>
                <label className="form-field">Subject
                  <select required value={studySessionDraft.subjectId} onChange={(event) => setStudySessionDraft({ ...studySessionDraft, subjectId: event.target.value })} disabled={studyBusy || studySubjects.length === 0}>
                    <option value="">Choose a subject</option>
                    {studySubjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}
                  </select>
                </label>
                <label className="form-field">Topic or goal
                  <input required maxLength={120} value={studySessionDraft.topic} onChange={(event) => setStudySessionDraft({ ...studySessionDraft, topic: event.target.value })} placeholder="e.g. Review cell division" disabled={studyBusy} />
                </label>
                <label className="form-field">Date
                  <input required type="date" value={studySessionDraft.sessionDate} onChange={(event) => setStudySessionDraft({ ...studySessionDraft, sessionDate: event.target.value })} disabled={studyBusy} />
                </label>
                <label className="form-field">Start time <span className="optional-label">Optional</span>
                  <input type="time" value={studySessionDraft.startTime} onChange={(event) => setStudySessionDraft({ ...studySessionDraft, startTime: event.target.value })} disabled={studyBusy} />
                </label>
                <label className="form-field">Estimated duration (minutes)
                  <input required type="number" min="1" max="600" step="1" value={studySessionDraft.estimatedMinutes} onChange={(event) => setStudySessionDraft({ ...studySessionDraft, estimatedMinutes: event.target.value })} disabled={studyBusy} />
                </label>
                <button type="submit" className="primary-button study-session-submit" disabled={studyBusy || studySubjects.length === 0}><Icon name="plus" size={16} /> Schedule session</button>
              </form>
            </article>

            <article className="panel study-sessions-panel">
              <div className="panel-heading"><div><h2>Your study sessions</h2><p>{studySessions.length} scheduled · mark sessions complete when you finish.</p></div></div>
              {sortedSessions.length === 0 ? <p className="empty-tasks">No study sessions yet. Add one above to create a focused plan.</p> : (
                <div className="study-session-list">
                  {sortedSessions.map((studySession) => {
                    const subject = studySubjects.find((item) => item.id === studySession.subject_id)
                    return (
                      <article className={`study-session-card ${studySession.completed ? 'study-session-complete' : ''}`} key={studySession.id}>
                        <div className="study-session-time"><strong>{new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${studySession.session_date}T12:00:00`))}</strong><span>{studySession.start_time?.slice(0, 5) || 'Flexible time'}</span></div>
                        <div className="study-session-copy"><strong>{studySession.topic}</strong><span>{subject?.name || 'Study'} · {studySession.estimated_minutes} min</span></div>
                        <button type="button" className={`study-session-toggle ${studySession.completed ? 'study-session-toggle-done' : ''}`} onClick={() => toggleStudySession(studySession)} disabled={studyBusy} aria-label={`${studySession.completed ? 'Mark incomplete' : 'Mark complete'}: ${studySession.topic}`}>{studySession.completed ? 'Done' : 'Complete'}</button>
                      </article>
                    )
                  })}
                </div>
              )}
            </article>
          </>
        ) : null}
      </div>
    )
  }

  function renderReminderPanel() {
    const notificationSupported = typeof window !== 'undefined' && 'Notification' in window
    const reminderCopy = reminderPermission === 'granted'
      ? 'Browser reminders are enabled for tasks due today while Planora is open.'
      : reminderPermission === 'denied'
        ? 'Notifications are blocked by your browser. Allow them for this site in browser settings to enable reminders.'
        : reminderPermission === 'unsupported'
          ? 'This browser does not support desktop notifications.'
          : 'Allow browser notifications to get a reminder when tasks are due today.'

    return (
      <article className="panel reminder-panel">
        <div className="reminder-copy"><span className="stat-icon stat-blue"><Icon name="bell" size={18} /></span><span><strong>Due-date reminders</strong><small>{reminderCopy} The app must remain open; reminders are not sent when the browser is closed.</small></span></div>
        <button type="button" className="secondary-button" onClick={enableDueReminders} disabled={!notificationSupported || reminderPermission === 'granted' || reminderPermission === 'requesting'}>
          {reminderPermission === 'granted' ? 'Reminders enabled' : reminderPermission === 'requesting' ? 'Requesting…' : 'Enable reminders'}
        </button>
        {reminderError && <p className="task-error" role="alert">{reminderError}</p>}
        <p className="reminder-requirements">Requires browser notification permission and a secure HTTPS deployment (localhost is allowed for development).</p>
      </article>
    )
  }

  function renderOtherPage() {
    const pageCopy = {
      Planner: {
        eyebrow: 'AI DAILY PLANNER',
        title: 'Plan your day',
        subtitle: 'A suggested schedule built from your own tasks, priorities, and estimates.',
      },
      Calendar: {
        eyebrow: 'YOUR DATES, AT A GLANCE',
        title: 'Calendar',
        subtitle: 'See task deadlines and planned study sessions together.',
      },
      'Study Planner': {
        eyebrow: 'A STEADY STUDY ROUTINE',
        title: 'Study planner',
        subtitle: 'Organize subjects into focused sessions with realistic time estimates.',
      },
      Goals: {
        eyebrow: 'SMALL STEPS, BIG PICTURE',
        title: 'Goals',
        subtitle: 'Keep your longer-term intentions in view.',
      },
      'AI Assistant': {
        eyebrow: 'PERSONAL PLANNING SUPPORT',
        title: 'Your planning companion',
        subtitle: 'Ask for practical planning help grounded in your current task list.',
      },
      Analytics: {
        eyebrow: 'YOUR PROGRESS, FROM YOUR TASKS',
        title: 'Analytics',
        subtitle: 'A snapshot calculated from your current task list.',
      },
    }
    const page = pageCopy[activeNav]

    return (
      <section className="page-section">
        <div className="welcome-row page-welcome">
          <div><div className="eyebrow"><span className="eyebrow-dot" /> {page.eyebrow}</div><h1>{page.title}</h1><p className="welcome-subtitle">{page.subtitle}</p></div>
          {activeNav === 'Planner' && <button className="primary-button" onClick={() => openTaskDialog()}><Icon name="plus" size={18} /> Add task</button>}
        </div>

        {activeNav === 'Planner' && (
          <article className="panel page-panel daily-planner-panel">
            <div className="panel-heading daily-planner-heading">
              <div><h2>Your suggested plan</h2><p>Starts at 9:00 AM · High priority first, then nearest due date and shorter tasks</p></div>
              <button className="primary-button" onClick={generateDailyPlan} disabled={tasksLoading || pendingTasks === 0}>
                <Icon name="sparkles" size={16} /> Generate My Plan
              </button>
            </div>
            {renderDailyPlan()}
            <p className="planner-note">This plan is generated locally as a suggestion. It won&apos;t change your task details or due dates.</p>
          </article>
        )}

        {activeNav === 'Calendar' && renderCalendarPage()}
        {activeNav === 'Study Planner' && renderStudyPlannerPage()}

        {activeNav === 'Goals' && (
          <article className="panel page-panel prototype-panel">
            <span className="stat-icon stat-purple"><Icon name="target" size={20} /></span>
            <h2>Make progress at your own pace</h2>
            <p>Goal tracking is a preview in this frontend. Add a goal-management workflow in a later project stage.</p>
            <button className="secondary-button" onClick={() => navigateTo('My Tasks')}>Explore your tasks</button>
          </article>
        )}

        {activeNav === 'AI Assistant' && renderAssistantPage()}

        {activeNav === 'Analytics' && (
          <>
            <section className="stats-grid compact-stats" aria-label="Task analytics">
              <article className="stat-card"><div className="stat-value">{tasks.length}</div><div className="stat-label">Total tasks</div><div className="stat-foot">Current task list</div></article>
              <article className="stat-card"><div className="stat-value">{completedTasks}</div><div className="stat-label">Completed</div><div className="stat-foot">Marked complete</div></article>
              <article className="stat-card"><div className="stat-value">{pendingTasks}</div><div className="stat-label">Pending</div><div className="stat-foot">Still to do</div></article>
              <article className="stat-card"><div className="stat-value">{productivity}%</div><div className="stat-label">Completion rate</div><div className="mini-progress" role="progressbar" aria-label="Task completion" aria-valuenow={productivity} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${productivity}%` }} /></div></article>
            </section>
            {renderProductivityPanel()}
            <article className="panel analytics-tasks"><div className="panel-heading"><div><h2>Task completion</h2><p>Check off tasks to update your analytics</p></div><button className="text-button" onClick={() => navigateTo('My Tasks')}>Manage tasks <Icon name="arrow" size={15} /></button></div>{renderTaskRows()}</article>
          </>
        )}
      </section>
    )
  }

  const pageTitle = activeNav === 'Dashboard' ? 'Dashboard' : activeNav
  const userEmail = session.user.email || 'Signed-in user'

  return (
    <div className="app-shell">
      {menuOpen && <button className="sidebar-backdrop" aria-label="Dismiss navigation" onClick={() => setMenuOpen(false)} />}
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <a className="brand" href="#dashboard" aria-label="Planora AI home" onClick={() => navigateTo('Dashboard')}>
          <span className="brand-mark"><Icon name="sparkles" size={21} /></span>
          <span className="brand-name">planora<span>ai</span></span>
        </a>
        <button className="sidebar-close" aria-label="Close navigation" onClick={() => setMenuOpen(false)}><Icon name="close" size={19} /></button>
        <div className="sidebar-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <button
              className={`nav-item ${activeNav === item.label ? 'nav-item-active' : ''}`}
              key={item.label}
              aria-current={activeNav === item.label ? 'page' : undefined}
              onClick={() => navigateTo(item.label)}
            >
              <Icon name={item.icon} size={19} /><span>{item.label}</span>
              {item.label === 'My Tasks' && <span className="nav-count">{pendingTasks}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="upgrade-card">
            <div className="upgrade-icon"><Icon name="sparkles" size={18} /></div>
            <strong>A little more focus?</strong>
            <p>Your week is off to a great start. Keep your momentum going.</p>
            <button onClick={() => navigateTo('AI Assistant')}>Explore prototype <Icon name="arrow" size={14} /></button>
          </div>
          <div className="profile-menu">
            <span className="avatar">{userEmail.charAt(0).toUpperCase()}</span>
            <span className="profile-copy"><strong>{userEmail}</strong><small>Signed in</small></span>
            <button className="profile-logout" onClick={signOut}>Log out</button>
          </div>
        </div>
      </aside>

      <main className="main-area" id="dashboard">
        <header className="topbar">
          <button className="mobile-menu" aria-label={menuOpen ? 'Close menu' : 'Open menu'} onClick={() => setMenuOpen(!menuOpen)}><Icon name={menuOpen ? 'close' : 'menu'} /></button>
          <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>{pageTitle}</strong></div>
          <div className="topbar-actions">
            <span className="header-date"><Icon name="calendar" size={16} />{today}</span>
            <button className="icon-button search-button" aria-label="Search tasks" onClick={() => { navigateTo('My Tasks'); document.querySelector('.task-search-label input')?.focus() }}><Icon name="search" size={19} /></button>
            <button className="icon-button notification-button" aria-label="Notifications"><Icon name="bell" size={19} /><i /></button>
            <div className={`connection-indicator connection-${connectionStatus.state}`} role="status" aria-live="polite">
              <span className="connection-dot" />
              {connectionStatus.message}
            </div>
            {connectionStatus.state === 'error' && <button className="connection-retry" onClick={retryConnectionTest}>Retry</button>}
            <span className="avatar top-avatar" aria-label={`Signed in as ${userEmail}`}>{userEmail.charAt(0).toUpperCase()}</span>
          </div>
        </header>

        <div className="dashboard-content">
          {taskError && <p className="task-error" role="alert">{taskError}</p>}
          {signOutError && <p className="task-error" role="alert">{signOutError}</p>}
          {activeNav === 'Dashboard' && renderDashboard()}
          {activeNav === 'My Tasks' && renderTasksPage()}
          {activeNav !== 'Dashboard' && activeNav !== 'My Tasks' && renderOtherPage()}
          <footer className="dashboard-footer"><span>Made for a more intentional day <span className="footer-heart">♥</span></span><span>Planora AI <i /> Your personal planning space</span></footer>
        </div>
      </main>

      {taskDialog && (
        <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setTaskDialog(null) }}>
          <section className="task-dialog" role="dialog" aria-modal="true" aria-labelledby="task-dialog-title">
            <div className="dialog-heading"><div><h2 id="task-dialog-title">{taskDialog.id === null ? 'Add a task' : 'Edit task'}</h2><p>Keep it clear and manageable.</p></div><button className="dialog-close" onClick={() => setTaskDialog(null)} aria-label="Close dialog"><Icon name="close" size={19} /></button></div>
            <form onSubmit={saveTask}>
              <label className="form-field">Task name<input autoFocus required maxLength={100} value={taskDialog.title} onChange={(event) => setTaskDialog({ ...taskDialog, title: event.target.value })} placeholder="What needs to get done?" /></label>
              <label className="form-field">Notes <span className="optional-label">Optional</span><input maxLength={120} value={taskDialog.detail} onChange={(event) => setTaskDialog({ ...taskDialog, detail: event.target.value })} placeholder="Category, time, or a short note" /></label>
              <label className="form-field">Estimated duration (minutes)<input type="number" required min="1" step="1" value={taskDialog.estimatedMinutes} onChange={(event) => setTaskDialog({ ...taskDialog, estimatedMinutes: event.target.value })} /></label>
              <div className="form-field">
                <label htmlFor="task-due-date">Due date <span className="optional-label">Optional</span></label>
                <div className="due-date-input-row">
                  <input id="task-due-date" type="date" value={taskDialog.dueDate} disabled={taskBusy} onChange={(event) => setTaskDialog({ ...taskDialog, dueDate: event.target.value })} />
                  <button type="button" className="clear-date-button" disabled={!taskDialog.dueDate || taskBusy} onClick={() => setTaskDialog({ ...taskDialog, dueDate: '' })}>Clear</button>
                </div>
              </div>
              <label className="form-field">Priority<select value={taskDialog.priority} onChange={(event) => setTaskDialog({ ...taskDialog, priority: event.target.value })}>{priorities.map((priority) => <option key={priority}>{priority}</option>)}</select></label>
              <div className="dialog-actions"><button type="button" className="cancel-button" disabled={taskBusy} onClick={() => setTaskDialog(null)}>Cancel</button><button type="submit" className="primary-button" disabled={taskBusy}>{taskBusy ? 'Saving…' : taskDialog.id === null ? 'Add task' : 'Save changes'}</button></div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setAuthLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (authLoading) {
    return <main className="auth-loading" role="status">Checking your Planora session…</main>
  }

  if (!session) {
    return <AuthScreen />
  }

  return <DashboardApp key={session.user.id} session={session} />
}

export default App
