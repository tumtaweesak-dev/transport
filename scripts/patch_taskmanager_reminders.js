const fs = require("fs");

const target = "C:\\Users\\tumta\\OneDrive\\เอกสาร\\Antigravity\\TaskManagerOffline\\TaskManager.ps1";
let text = fs.readFileSync(target, "utf8").replace(/^\uFEFF/, "");

function replaceOnce(search, replacement) {
  const next = text.replace(search, replacement);
  if (next === text) {
    throw new Error(`Pattern not found: ${search}`);
  }
  text = next;
}

replaceOnce(
  '$script:CurrentFilter = "ทั้งหมด"',
  '$script:CurrentFilter = "ทั้งหมด"\r\n$script:AlertedReminders = @{}'
);

replaceOnce(
  'function Load-Tasks {',
  `function Ensure-TaskFields {
    foreach ($task in @($script:Tasks)) {
        if ($null -eq $task.PSObject.Properties["ReminderAt"]) {
            $task | Add-Member -NotePropertyName ReminderAt -NotePropertyValue ""
        }
        if ($null -eq $task.PSObject.Properties["ReminderShownAt"]) {
            $task | Add-Member -NotePropertyName ReminderShownAt -NotePropertyValue ""
        }
    }
}

function Load-Tasks {`
);

replaceOnce(
  `            } else {
                $script:Tasks = @($data)
            }`,
  `            } else {
                $script:Tasks = @($data)
            }
            Ensure-TaskFields`
);

replaceOnce(
  `                UpdatedAt = (Get-Date).ToString("s")
            }`,
  `                UpdatedAt = (Get-Date).ToString("s")
                ReminderAt = ""
                ReminderShownAt = ""
            }`
);

replaceOnce(
  'function Save-Tasks {',
  `function Get-ReminderText {
    param([object]$Task)

    if ([string]::IsNullOrWhiteSpace([string]$Task.ReminderAt)) {
        return ""
    }

    try {
        return ([datetime]$Task.ReminderAt).ToString("yyyy-MM-dd HH:mm")
    } catch {
        return [string]$Task.ReminderAt
    }
}

function Check-Reminders {
    $now = Get-Date
    foreach ($task in @($script:Tasks)) {
        if ($task.Status -eq "เสร็จแล้ว") { continue }
        if ([string]::IsNullOrWhiteSpace([string]$task.ReminderAt)) { continue }

        try {
            $reminderTime = [datetime]$task.ReminderAt
        } catch {
            continue
        }

        if ($reminderTime -gt $now) { continue }
        if ([string]$task.ReminderShownAt -eq $task.ReminderAt) { continue }

        $alertKey = "$($task.Id)|$($task.ReminderAt)"
        if ($script:AlertedReminders.ContainsKey($alertKey)) { continue }
        $script:AlertedReminders[$alertKey] = $true

        $task.ReminderShownAt = $task.ReminderAt
        Save-Tasks
        Refresh-Grid

        $message = "ถึงเวลาแจ้งเตือนงาน:\`r\`n\`r\`n$($task.Title)\`r\`n\`r\`nผู้รับผิดชอบ: $($task.Owner)\`r\`nกำหนดส่ง: $($task.DueDate)"
        [System.Windows.Forms.MessageBox]::Show($Form, $message, "แจ้งเตือนงาน", "OK", "Information") | Out-Null
    }
}

function Save-Tasks {`
);

replaceOnce(
  '([string]$_.Note).ToLower().Contains($keyword)',
  `([string]$_.Note).ToLower().Contains($keyword) -or
            ([string]$_.ReminderAt).ToLower().Contains($keyword)`
);

replaceOnce(
  '$row.Cells["Note"].Value = $task.Note',
  `$row.Cells["ReminderAt"].Value = Get-ReminderText $task
        $row.Cells["Note"].Value = $task.Note`
);

replaceOnce(
  '$dialog.Size = New-Object System.Drawing.Size(520, 470)',
  '$dialog.Size = New-Object System.Drawing.Size(520, 560)'
);

replaceOnce(
  '$noteLabel.Location = New-Object System.Drawing.Point(18, 216)',
  `$reminderCheck = New-Object System.Windows.Forms.CheckBox
    $reminderCheck.Text = "แจ้งเตือน"
    $reminderCheck.Location = New-Object System.Drawing.Point(18, 216)
    $reminderCheck.Size = New-Object System.Drawing.Size(120, 26)

    $reminderDatePicker = New-Object System.Windows.Forms.DateTimePicker
    $reminderDatePicker.Location = New-Object System.Drawing.Point(150, 216)
    $reminderDatePicker.Size = New-Object System.Drawing.Size(170, 30)
    $reminderDatePicker.Format = "Custom"
    $reminderDatePicker.CustomFormat = "yyyy-MM-dd"

    $reminderTimePicker = New-Object System.Windows.Forms.DateTimePicker
    $reminderTimePicker.Location = New-Object System.Drawing.Point(334, 216)
    $reminderTimePicker.Size = New-Object System.Drawing.Size(148, 30)
    $reminderTimePicker.Format = "Custom"
    $reminderTimePicker.CustomFormat = "HH:mm"
    $reminderTimePicker.ShowUpDown = $true

    if ($isEdit -and $Task.ReminderAt) {
        try {
            $reminderValue = [datetime]$Task.ReminderAt
            $reminderCheck.Checked = $true
            $reminderDatePicker.Value = $reminderValue
            $reminderTimePicker.Value = $reminderValue
        } catch {
            $reminderDatePicker.Value = Get-Date
            $reminderTimePicker.Value = Get-Date
        }
    } else {
        $reminderDatePicker.Value = Get-Date
        $reminderTimePicker.Value = (Get-Date).AddMinutes(30)
    }

    $noteLabel.Location = New-Object System.Drawing.Point(18, 260)`
);

replaceOnce(
  '$noteBox.Location = New-Object System.Drawing.Point(18, 240)',
  '$noteBox.Location = New-Object System.Drawing.Point(18, 284)'
);
replaceOnce(
  '$noteBox.Size = New-Object System.Drawing.Size(465, 110)',
  '$noteBox.Size = New-Object System.Drawing.Size(465, 120)'
);
replaceOnce(
  '$saveButton.Location = New-Object System.Drawing.Point(292, 374)',
  '$saveButton.Location = New-Object System.Drawing.Point(292, 430)'
);
replaceOnce(
  '$cancelButton.Location = New-Object System.Drawing.Point(392, 374)',
  '$cancelButton.Location = New-Object System.Drawing.Point(392, 430)'
);

replaceOnce(
  '$dialog.Controls.AddRange(@($titleLabel, $titleBox, $ownerLabel, $ownerBox, $priorityLabel, $priorityBox, $statusLabel, $statusBox, $dateLabel, $datePicker, $noteLabel, $noteBox, $saveButton, $cancelButton))',
  '$dialog.Controls.AddRange(@($titleLabel, $titleBox, $ownerLabel, $ownerBox, $priorityLabel, $priorityBox, $statusLabel, $statusBox, $dateLabel, $datePicker, $reminderCheck, $reminderDatePicker, $reminderTimePicker, $noteLabel, $noteBox, $saveButton, $cancelButton))'
);

replaceOnce(
  `$Task.Note = $noteBox.Text.Trim()
        $Task.UpdatedAt = (Get-Date).ToString("s")`,
  `$Task.Note = $noteBox.Text.Trim()
        if ($reminderCheck.Checked) {
            $reminderAt = Get-Date -Year $reminderDatePicker.Value.Year -Month $reminderDatePicker.Value.Month -Day $reminderDatePicker.Value.Day -Hour $reminderTimePicker.Value.Hour -Minute $reminderTimePicker.Value.Minute -Second 0
            $newReminder = $reminderAt.ToString("s")
            if ($Task.ReminderAt -ne $newReminder) { $Task.ReminderShownAt = "" }
            $Task.ReminderAt = $newReminder
        } else {
            $Task.ReminderAt = ""
            $Task.ReminderShownAt = ""
        }
        $Task.UpdatedAt = (Get-Date).ToString("s")`
);

replaceOnce(
  `Note = $noteBox.Text.Trim()
            UpdatedAt = (Get-Date).ToString("s")`,
  `Note = $noteBox.Text.Trim()
            ReminderAt = $(if ($reminderCheck.Checked) { (Get-Date -Year $reminderDatePicker.Value.Year -Month $reminderDatePicker.Value.Month -Day $reminderDatePicker.Value.Day -Hour $reminderTimePicker.Value.Hour -Minute $reminderTimePicker.Value.Minute -Second 0).ToString("s") } else { "" })
            ReminderShownAt = ""
            UpdatedAt = (Get-Date).ToString("s")`
);

replaceOnce(
  '[void]$Grid.Columns.Add("Note", "หมายเหตุ")',
  `[void]$Grid.Columns.Add("ReminderAt", "แจ้งเตือน")
[void]$Grid.Columns.Add("Note", "หมายเหตุ")`
);
replaceOnce(
  `$Grid.Columns["DueDate"].FillWeight = 80
$Grid.Columns["Note"].FillWeight = 180`,
  `$Grid.Columns["DueDate"].FillWeight = 80
$Grid.Columns["ReminderAt"].FillWeight = 90
$Grid.Columns["Note"].FillWeight = 160`
);

replaceOnce(
  '$OpenFolderButton = New-Object System.Windows.Forms.Button',
  `$TestReminderButton = New-Object System.Windows.Forms.Button
$TestReminderButton.Text = "ทดสอบแจ้งเตือน"
$TestReminderButton.Location = New-Object System.Drawing.Point(386, 578)
$TestReminderButton.Size = New-Object System.Drawing.Size(140, 36)
$TestReminderButton.Anchor = "Bottom, Left"

$OpenFolderButton = New-Object System.Windows.Forms.Button`
);
replaceOnce(
  '$Form.Controls.AddRange(@($TitleLabel, $SummaryLabel, $AddButton, $EditButton, $SearchBox, $PriorityFilter, $AllButton, $TodoButton, $DoingButton, $DoneButton, $Grid, $MarkDoingButton, $MarkDoneButton, $DeleteButton, $OpenFolderButton))',
  '$Form.Controls.AddRange(@($TitleLabel, $SummaryLabel, $AddButton, $EditButton, $SearchBox, $PriorityFilter, $AllButton, $TodoButton, $DoingButton, $DoneButton, $Grid, $MarkDoingButton, $MarkDoneButton, $DeleteButton, $TestReminderButton, $OpenFolderButton))'
);

replaceOnce(
  `$OpenFolderButton.Add_Click({
    Start-Process explorer.exe $AppDir
})`,
  `$TestReminderButton.Add_Click({
    $task = Get-SelectedTask
    if ($null -eq $task) {
        [System.Windows.Forms.MessageBox]::Show("กรุณาเลือกงานก่อน", "ยังไม่ได้เลือกงาน", "OK", "Information") | Out-Null
        return
    }
    [System.Windows.Forms.MessageBox]::Show($Form, "ตัวอย่างแจ้งเตือนงาน:\`r\`n\`r\`n$($task.Title)", "ทดสอบแจ้งเตือน", "OK", "Information") | Out-Null
})

$OpenFolderButton.Add_Click({
    Start-Process explorer.exe $AppDir
})`
);

replaceOnce(
  `Load-Tasks
Refresh-Grid

[void][System.Windows.Forms.Application]::Run($Form)`,
  `Load-Tasks
Refresh-Grid

$ReminderTimer = New-Object System.Windows.Forms.Timer
$ReminderTimer.Interval = 30000
$ReminderTimer.Add_Tick({ Check-Reminders })
$ReminderTimer.Start()
$Form.Add_Shown({ Check-Reminders })
$Form.Add_FormClosed({ $ReminderTimer.Stop(); $ReminderTimer.Dispose() })

[void][System.Windows.Forms.Application]::Run($Form)`
);

fs.writeFileSync(target, "\uFEFF" + text, "utf8");
console.log("patched reminders");
