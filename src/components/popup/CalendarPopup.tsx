import { useState, useEffect } from 'react'
import { usePopupExit } from '../../utils/usePopupExit'

type HolidayMap = Record<string, string>

function pad2(value: number) {
    return String(value).padStart(2, '0')
}

function dateKeyLocal(date: Date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

// Gregorian Easter Sunday (Meeus/Jones/Butcher algorithm)
function easterSunday(year: number) {
    const a = year % 19
    const b = Math.floor(year / 100)
    const c = year % 100
    const d = Math.floor(b / 4)
    const e = b % 4
    const f = Math.floor((b + 8) / 25)
    const g = Math.floor((b - f + 1) / 3)
    const h = (19 * a + b - d - g + 15) % 30
    const i = Math.floor(c / 4)
    const k = c % 4
    const l = (32 + 2 * e + 2 * i - h - k) % 7
    const m = Math.floor((a + 11 * h + 22 * l) / 451)
    const month = Math.floor((h + l - 7 * m + 114) / 31) // 3=Mar, 4=Apr
    const day = ((h + l - 7 * m + 114) % 31) + 1
    return new Date(year, month - 1, day)
}

function addDays(base: Date, delta: number) {
    const d = new Date(base)
    d.setDate(d.getDate() + delta)
    return d
}

function brazilHolidays(year: number): HolidayMap {
    const map: HolidayMap = {}

    const fixed: Array<[number, number, string]> = [
        [1, 1, 'Confraternização Universal'],
        [4, 21, 'Tiradentes'],
        [5, 1, 'Dia do Trabalho'],
        [9, 7, 'Independência do Brasil'],
        [10, 12, 'Nossa Senhora Aparecida'],
        [11, 2, 'Finados'],
        [11, 15, 'Proclamação da República'],
        [11, 20, 'Dia da Consciência Negra'],
        [12, 25, 'Natal'],
    ]

    for (const [month, day, name] of fixed) {
        const d = new Date(year, month - 1, day)
        map[dateKeyLocal(d)] = name
    }

    const easter = easterSunday(year)
    map[dateKeyLocal(easter)] = 'Páscoa'
    map[dateKeyLocal(addDays(easter, -2))] = 'Sexta-feira Santa'
    map[dateKeyLocal(addDays(easter, -48))] = 'Carnaval (segunda)'
    map[dateKeyLocal(addDays(easter, -47))] = 'Carnaval (terça)'
    map[dateKeyLocal(addDays(easter, 60))] = 'Corpus Christi'

    return map
}

type HolidayColor = 'blue' | 'red' | 'purple' | 'green' | 'orange' | 'cyan'

function holidayColor(name: string): HolidayColor {
    const n = name.toLowerCase()

    // Cultural
    if (n.includes('carnaval')) return 'red'

    // Religious
    if (
        n.includes('páscoa') ||
        n.includes('sexta-feira santa') ||
        n.includes('corpus christi') ||
        n.includes('natal') ||
        n.includes('finados') ||
        n.includes('nossa senhora')
    ) {
        return 'purple'
    }

    // Civic / national
    if (
        n.includes('independ') ||
        n.includes('tiradentes') ||
        n.includes('proclama') ||
        n.includes('confraternização')
    ) {
        return 'blue'
    }

    if (n.includes('trabalho')) return 'green'
    if (n.includes('consci')) return 'orange'

    return 'cyan'
}

export function CalendarPopup() {
    const [currentDate, setCurrentDate] = useState(new Date())
    const [viewDate, setViewDate] = useState(new Date())
    const { isExiting } = usePopupExit()

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentDate(new Date())
        }, 1000)
        return () => clearInterval(timer)
    }, [])

    const timeString = currentDate.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    })

    const fullDateString = currentDate.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    })

    // Calendar logic
    const year = viewDate.getFullYear()
    const month = viewDate.getMonth()
    
    const firstDayOfMonth = new Date(year, month, 1)
    const lastDayOfMonth = new Date(year, month + 1, 0)
    // Week starts on Sunday
    // JS getDay(): 0=Sunday..6=Saturday
    const startingDay = firstDayOfMonth.getDay()
    const daysInMonth = lastDayOfMonth.getDate()
    
    const monthName = viewDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

    const holidays = brazilHolidays(year)

    const monthKeyPrefix = `${year}-${pad2(month + 1)}-`
    const holidaysThisMonth = Object.entries(holidays)
        .filter(([key]) => key.startsWith(monthKeyPrefix))
        .map(([key, name]) => ({ day: Number(key.slice(-2)), name, color: holidayColor(name), key }))
        .sort((a, b) => a.day - b.day)

    const emptyHolidayText = 'Sem feriados nacionais neste mês'
    
    const calendarDays = []
    
    // Always render 6 full weeks (42 cells) so the grid fills the popup consistently
    const totalCells = 6 * 7

    // Empty cells before first day
    for (let i = 0; i < startingDay; i++) {
        calendarDays.push(<div key={`empty-start-${i}`} className="calendar-day calendar-day--empty"></div>)
    }
    
    // Days of month
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day)
        const dow = date.getDay() // 0=Sunday..6=Saturday
        const key = dateKeyLocal(date)
        const holidayName = holidays[key]

        const isToday = 
            day === currentDate.getDate() && 
            month === currentDate.getMonth() && 
            year === currentDate.getFullYear()
        
        calendarDays.push(
            <div 
                key={day} 
                className={
                    [
                        'calendar-day',
                        isToday ? 'calendar-day--today' : '',
                        dow === 0 ? 'calendar-day--sunday' : '',
                        dow === 6 ? 'calendar-day--saturday' : '',
                        holidayName ? 'calendar-day--holiday' : '',
                    ]
                        .filter(Boolean)
                        .join(' ')
                }
                title={holidayName ? `Feriado: ${holidayName}` : undefined}
            >
                {day}
            </div>
        )
    }

    // Trailing empty cells to complete the 6-week grid
    while (calendarDays.length < totalCells) {
        calendarDays.push(
            <div
                key={`empty-end-${calendarDays.length}`}
                className="calendar-day calendar-day--empty"
            ></div>
        )
    }

    const prevMonth = () => {
        setViewDate(new Date(year, month - 1, 1))
    }

    const nextMonth = () => {
        setViewDate(new Date(year, month + 1, 1))
    }

    const goToToday = () => {
        setViewDate(new Date())
    }

    return (
        <div className={`popup popup--calendar${isExiting ? ' popup--exiting' : ''}`}>
            {/* Current Time & Date */}
            <div className="calendar-header">
                <div className="calendar-time">{timeString}</div>
                <div className="calendar-date">{fullDateString}</div>
            </div>

            {/* Calendar Navigation */}
            <div className="calendar-nav">
                <button className="calendar-nav-btn" onClick={prevMonth}>‹</button>
                <span className="calendar-nav-title" onClick={goToToday}>{monthName}</span>
                <button className="calendar-nav-btn" onClick={nextMonth}>›</button>
            </div>

            {/* Calendar Grid */}
            <div className="calendar-grid">
                {/* Day headers */}
                {days.map((day, index) => (
                    <div
                        key={day}
                        className={
                            [
                                'calendar-day-header',
                                index === 0 ? 'calendar-day-header--sunday' : '',
                                index === 6 ? 'calendar-day-header--saturday' : '',
                            ]
                                .filter(Boolean)
                                .join(' ')
                        }
                    >
                        {day}
                    </div>
                ))}
                {/* Days */}
                {calendarDays}
            </div>

            <div
                className="calendar-footer"
                title={
                    holidaysThisMonth.length > 0
                        ? holidaysThisMonth.map((h) => `${h.day} ${h.name}`).join(' ')
                        : undefined
                }
            >
                {holidaysThisMonth.length === 0 ? (
                    <span className="calendar-footer__value">{emptyHolidayText}</span>
                ) : (
                    holidaysThisMonth.map((h) => (
                        <span key={h.key} className="calendar-holiday">
                            <span className={`calendar-holiday__day calendar-holiday__day--${h.color}`}>{h.day}</span>
                            <span className="calendar-holiday__name">{h.name}</span>
                        </span>
                    ))
                )}
            </div>
        </div>
    )
}
