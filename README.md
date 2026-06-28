# MindDock

MindDock is an offline-first, modular desktop workspace for personal productivity.

## Version 0.1

This first desktop version includes:

- Modular app registry
- Local JSON data storage
- Task management
- Daily, weekly, and monthly calendar views
- Desktop reminders for today's unfinished tasks
- Focus timer
- Habit tracker
- Notes
- Personal analytics
- Basic workspace settings

## Run

```powershell
npm.cmd run setup
npm.cmd start
```

Data is saved locally in the Electron user data directory.

If an old root `node_modules/electron` folder is locked by Windows, it is safe to remove it after closing file scanners or restarting Windows. MindDock runs from `desktop-runtime`.
