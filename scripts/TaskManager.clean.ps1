Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

[System.Windows.Forms.Application]::EnableVisualStyles()

$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DataFile = Join-Path $AppDir "tasks.json"
$script:Tasks = @()
$script:CurrentFilter = "ทั้งหมด"
$script:AlertedReminders = @{}

function New-TaskId {
    return ([guid]::NewGuid().ToString())
}

function Ensure-TaskFields {
    foreach ($task in @($script:Tasks)) {
        if ($null -eq $task.PSObject.Properties["ReminderAt"]) {
            $task | Add-Member -NotePropertyName ReminderAt -NotePropertyValue ""
        }
        if ($null -eq $task.PSObject.Properties["ReminderShownAt"]) {
            $task | Add-Member -NotePropertyName ReminderShownAt -NotePropertyValue ""
        }
    }
}

function Save-Tasks {
    $script:Tasks | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $DataFile -Encoding UTF8
}

function Load-Tasks {
    if (Test-Path $DataFile) {
        try {
            $data = Get-Content -LiteralPath $DataFile -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($null -eq $data) {
                $script:Tasks = @()
            } elseif ($data -is [array]) {
                $script:Tasks = @($data)
            } else {
                $script:Tasks = @($data)
            }
            Ensure-TaskFields
        } catch {
            [System.Windows.Forms.MessageBox]::Show("อ่านไฟล์ข้อมูลไม่ได้ โปรแกรมจะเริ่มด้วยรายการว่าง", "แจ้งเตือน", "OK", "Warning") | Out-Null
            $script:Tasks = @()
        }
    } else {
        $script:Tasks = @(
            [pscustomobject]@{
                Id = New-TaskId
                Title = "ตรวจงานค้างประจำวัน"
                Owner = "ฉัน"
                Priority = "สูง"
                Status = "รอทำ"
                DueDate = (Get-Date).ToString("yyyy-MM-dd")
                ReminderAt = ""
                ReminderShownAt = ""
                Note = "ตัวอย่างงานแรก สามารถแก้ไขหรือลบได้"
                UpdatedAt = (Get-Date).ToString("s")
            }
        )
        Save-Tasks
    }
}

function Get-ReminderText {
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

function Get-FilteredTasks {
    $keyword = $SearchBox.Text.Trim().ToLower()
    $items = @($script:Tasks)

    if ($script:CurrentFilter -ne "ทั้งหมด") {
        $items = @($items | Where-Object { $_.Status -eq $script:CurrentFilter })
    }

    if ($PriorityFilter.SelectedItem -and $PriorityFilter.SelectedItem -ne "ทั้งหมด") {
        $selectedPriority = [string]$PriorityFilter.SelectedItem
        $items = @($items | Where-Object { $_.Priority -eq $selectedPriority })
    }

    if ($keyword.Length -gt 0) {
        $items = @($items | Where-Object {
            ([string]$_.Title).ToLower().Contains($keyword) -or
            ([string]$_.Owner).ToLower().Contains($keyword) -or
            ([string]$_.Note).ToLower().Contains($keyword) -or
            ([string]$_.ReminderAt).ToLower().Contains($keyword)
        })
    }

    return @($items | Sort-Object @{ Expression = "DueDate"; Ascending = $true }, @{ Expression = "ReminderAt"; Ascending = $true })
}

function Refresh-Grid {
    $Grid.Rows.Clear()
    $items = Get-FilteredTasks

    foreach ($task in $items) {
        $rowIndex = $Grid.Rows.Add()
        $row = $Grid.Rows[$rowIndex]
        $row.Cells["Id"].Value = $task.Id
        $row.Cells["Title"].Value = $task.Title
        $row.Cells["Owner"].Value = $task.Owner
        $row.Cells["Priority"].Value = $task.Priority
        $row.Cells["Status"].Value = $task.Status
        $row.Cells["DueDate"].Value = $task.DueDate
        $row.Cells["ReminderAt"].Value = Get-ReminderText $task
        $row.Cells["Note"].Value = $task.Note

        if ($task.Status -eq "เสร็จแล้ว") {
            $row.DefaultCellStyle.BackColor = [System.Drawing.Color]::FromArgb(232, 248, 239)
        } elseif ($task.ReminderAt -and ([datetime]$task.ReminderAt) -le (Get-Date)) {
            $row.DefaultCellStyle.BackColor = [System.Drawing.Color]::FromArgb(255, 242, 220)
        } elseif ($task.DueDate -and ([datetime]$task.DueDate).Date -lt (Get-Date).Date) {
            $row.DefaultCellStyle.BackColor = [System.Drawing.Color]::FromArgb(255, 236, 241)
        } elseif ($task.Priority -eq "สูง") {
            $row.DefaultCellStyle.BackColor = [System.Drawing.Color]::FromArgb(255, 250, 232)
        }
    }

    $total = @($script:Tasks).Count
    $open = @($script:Tasks | Where-Object { $_.Status -ne "เสร็จแล้ว" }).Count
    $done = @($script:Tasks | Where-Object { $_.Status -eq "เสร็จแล้ว" }).Count
    $today = (Get-Date).ToString("yyyy-MM-dd")
    $dueToday = @($script:Tasks | Where-Object { $_.DueDate -eq $today -and $_.Status -ne "เสร็จแล้ว" }).Count
    $reminders = @($script:Tasks | Where-Object { $_.ReminderAt -and $_.Status -ne "เสร็จแล้ว" }).Count
    $SummaryLabel.Text = "ทั้งหมด $total งาน | เปิดอยู่ $open งาน | ครบกำหนดวันนี้ $dueToday งาน | แจ้งเตือน $reminders งาน | เสร็จแล้ว $done งาน"
}

function Get-SelectedTask {
    if ($Grid.SelectedRows.Count -eq 0) {
        return $null
    }

    $id = [string]$Grid.SelectedRows[0].Cells["Id"].Value
    return $script:Tasks | Where-Object { $_.Id -eq $id } | Select-Object -First 1
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
        if ([string]$task.ReminderShownAt -eq [string]$task.ReminderAt) { continue }

        $alertKey = "$($task.Id)|$($task.ReminderAt)"
        if ($script:AlertedReminders.ContainsKey($alertKey)) { continue }
        $script:AlertedReminders[$alertKey] = $true

        $task.ReminderShownAt = $task.ReminderAt
        Save-Tasks
        Refresh-Grid

        $message = "ถึงเวลาแจ้งเตือนงาน:`r`n`r`n$($task.Title)`r`n`r`nผู้รับผิดชอบ: $($task.Owner)`r`nกำหนดส่ง: $($task.DueDate)`r`nเวลาแจ้งเตือน: $(Get-ReminderText $task)"
        [System.Windows.Forms.MessageBox]::Show($Form, $message, "แจ้งเตือนงาน", "OK", "Information") | Out-Null
    }
}

function Show-TaskDialog {
    param([object]$Task)

    $isEdit = $null -ne $Task
    $dialog = New-Object System.Windows.Forms.Form
    $dialog.Text = $(if ($isEdit) { "แก้ไขงาน" } else { "เพิ่มงานใหม่" })
    $dialog.StartPosition = "CenterParent"
    $dialog.Size = New-Object System.Drawing.Size(520, 560)
    $dialog.FormBorderStyle = "FixedDialog"
    $dialog.MaximizeBox = $false
    $dialog.MinimizeBox = $false
    $dialog.Font = New-Object System.Drawing.Font("Segoe UI", 10)
    $dialog.BackColor = $LineBg

    $titleLabel = New-Object System.Windows.Forms.Label
    $titleLabel.Text = "ชื่องาน"
    $titleLabel.Location = New-Object System.Drawing.Point(18, 18)
    $titleLabel.Size = New-Object System.Drawing.Size(460, 22)

    $titleBox = New-Object System.Windows.Forms.TextBox
    $titleBox.Location = New-Object System.Drawing.Point(18, 42)
    $titleBox.Size = New-Object System.Drawing.Size(465, 30)
    $titleBox.Text = $(if ($isEdit) { $Task.Title } else { "" })

    $ownerLabel = New-Object System.Windows.Forms.Label
    $ownerLabel.Text = "ผู้รับผิดชอบ"
    $ownerLabel.Location = New-Object System.Drawing.Point(18, 84)
    $ownerLabel.Size = New-Object System.Drawing.Size(220, 22)

    $ownerBox = New-Object System.Windows.Forms.TextBox
    $ownerBox.Location = New-Object System.Drawing.Point(18, 108)
    $ownerBox.Size = New-Object System.Drawing.Size(220, 30)
    $ownerBox.Text = $(if ($isEdit) { $Task.Owner } else { "ฉัน" })

    $priorityLabel = New-Object System.Windows.Forms.Label
    $priorityLabel.Text = "ความสำคัญ"
    $priorityLabel.Location = New-Object System.Drawing.Point(262, 84)
    $priorityLabel.Size = New-Object System.Drawing.Size(220, 22)

    $priorityBox = New-Object System.Windows.Forms.ComboBox
    $priorityBox.Location = New-Object System.Drawing.Point(262, 108)
    $priorityBox.Size = New-Object System.Drawing.Size(220, 30)
    $priorityBox.DropDownStyle = "DropDownList"
    [void]$priorityBox.Items.AddRange(@("สูง", "กลาง", "ต่ำ"))
    $priorityBox.SelectedItem = $(if ($isEdit -and $Task.Priority) { $Task.Priority } else { "กลาง" })

    $statusLabel = New-Object System.Windows.Forms.Label
    $statusLabel.Text = "สถานะ"
    $statusLabel.Location = New-Object System.Drawing.Point(18, 150)
    $statusLabel.Size = New-Object System.Drawing.Size(220, 22)

    $statusBox = New-Object System.Windows.Forms.ComboBox
    $statusBox.Location = New-Object System.Drawing.Point(18, 174)
    $statusBox.Size = New-Object System.Drawing.Size(220, 30)
    $statusBox.DropDownStyle = "DropDownList"
    [void]$statusBox.Items.AddRange(@("รอทำ", "กำลังทำ", "เสร็จแล้ว"))
    $statusBox.SelectedItem = $(if ($isEdit -and $Task.Status) { $Task.Status } else { "รอทำ" })

    $dateLabel = New-Object System.Windows.Forms.Label
    $dateLabel.Text = "กำหนดส่ง"
    $dateLabel.Location = New-Object System.Drawing.Point(262, 150)
    $dateLabel.Size = New-Object System.Drawing.Size(220, 22)

    $datePicker = New-Object System.Windows.Forms.DateTimePicker
    $datePicker.Location = New-Object System.Drawing.Point(262, 174)
    $datePicker.Size = New-Object System.Drawing.Size(220, 30)
    $datePicker.Format = "Custom"
    $datePicker.CustomFormat = "yyyy-MM-dd"
    if ($isEdit -and $Task.DueDate) {
        $datePicker.Value = [datetime]$Task.DueDate
    } else {
        $datePicker.Value = Get-Date
    }

    $reminderCheck = New-Object System.Windows.Forms.CheckBox
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
            $reminderTimePicker.Value = (Get-Date).AddMinutes(30)
        }
    } else {
        $reminderDatePicker.Value = Get-Date
        $reminderTimePicker.Value = (Get-Date).AddMinutes(30)
    }

    $noteLabel = New-Object System.Windows.Forms.Label
    $noteLabel.Text = "หมายเหตุ"
    $noteLabel.Location = New-Object System.Drawing.Point(18, 260)
    $noteLabel.Size = New-Object System.Drawing.Size(460, 22)

    $noteBox = New-Object System.Windows.Forms.TextBox
    $noteBox.Location = New-Object System.Drawing.Point(18, 284)
    $noteBox.Size = New-Object System.Drawing.Size(465, 120)
    $noteBox.Multiline = $true
    $noteBox.ScrollBars = "Vertical"
    $noteBox.Text = $(if ($isEdit) { $Task.Note } else { "" })

    $saveButton = New-Object System.Windows.Forms.Button
    $saveButton.Text = "บันทึก"
    $saveButton.Location = New-Object System.Drawing.Point(292, 430)
    $saveButton.Size = New-Object System.Drawing.Size(92, 36)
    $saveButton.DialogResult = [System.Windows.Forms.DialogResult]::OK
    Set-LineButton $saveButton "Primary"

    $cancelButton = New-Object System.Windows.Forms.Button
    $cancelButton.Text = "ยกเลิก"
    $cancelButton.Location = New-Object System.Drawing.Point(392, 430)
    $cancelButton.Size = New-Object System.Drawing.Size(92, 36)
    $cancelButton.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    Set-LineButton $cancelButton "Secondary"

    @($titleBox, $ownerBox, $priorityBox, $statusBox, $datePicker, $reminderDatePicker, $reminderTimePicker, $noteBox) | ForEach-Object {
        Set-LineInput $_
    }
    @($titleLabel, $ownerLabel, $priorityLabel, $statusLabel, $dateLabel, $noteLabel, $reminderCheck) | ForEach-Object {
        $_.ForeColor = $LineText
        $_.BackColor = $LineBg
    }

    $dialog.AcceptButton = $saveButton
    $dialog.CancelButton = $cancelButton
    $dialog.Controls.AddRange(@($titleLabel, $titleBox, $ownerLabel, $ownerBox, $priorityLabel, $priorityBox, $statusLabel, $statusBox, $dateLabel, $datePicker, $reminderCheck, $reminderDatePicker, $reminderTimePicker, $noteLabel, $noteBox, $saveButton, $cancelButton))

    $result = $dialog.ShowDialog($Form)
    if ($result -ne [System.Windows.Forms.DialogResult]::OK) {
        return
    }

    if ([string]::IsNullOrWhiteSpace($titleBox.Text)) {
        [System.Windows.Forms.MessageBox]::Show("กรุณาใส่ชื่องาน", "ข้อมูลไม่ครบ", "OK", "Information") | Out-Null
        Show-TaskDialog -Task $Task
        return
    }

    $reminderValueText = ""
    if ($reminderCheck.Checked) {
        $reminderAt = Get-Date -Year $reminderDatePicker.Value.Year -Month $reminderDatePicker.Value.Month -Day $reminderDatePicker.Value.Day -Hour $reminderTimePicker.Value.Hour -Minute $reminderTimePicker.Value.Minute -Second 0
        $reminderValueText = $reminderAt.ToString("s")
    }

    if ($isEdit) {
        $Task.Title = $titleBox.Text.Trim()
        $Task.Owner = $ownerBox.Text.Trim()
        $Task.Priority = [string]$priorityBox.SelectedItem
        $Task.Status = [string]$statusBox.SelectedItem
        $Task.DueDate = $datePicker.Value.ToString("yyyy-MM-dd")
        $Task.Note = $noteBox.Text.Trim()
        if ([string]$Task.ReminderAt -ne $reminderValueText) {
            $Task.ReminderShownAt = ""
        }
        $Task.ReminderAt = $reminderValueText
        $Task.UpdatedAt = (Get-Date).ToString("s")
    } else {
        $script:Tasks += [pscustomobject]@{
            Id = New-TaskId
            Title = $titleBox.Text.Trim()
            Owner = $ownerBox.Text.Trim()
            Priority = [string]$priorityBox.SelectedItem
            Status = [string]$statusBox.SelectedItem
            DueDate = $datePicker.Value.ToString("yyyy-MM-dd")
            ReminderAt = $reminderValueText
            ReminderShownAt = ""
            Note = $noteBox.Text.Trim()
            UpdatedAt = (Get-Date).ToString("s")
        }
    }

    Save-Tasks
    Refresh-Grid
    Check-Reminders
}

$LineGreen = [System.Drawing.Color]::FromArgb(0, 122, 255)
$LineGreenDark = [System.Drawing.Color]::FromArgb(0, 91, 214)
$LineSoft = [System.Drawing.Color]::FromArgb(232, 242, 255)
$LineBg = [System.Drawing.Color]::FromArgb(244, 246, 250)
$LineBorder = [System.Drawing.Color]::FromArgb(222, 228, 236)
$LineText = [System.Drawing.Color]::FromArgb(18, 22, 28)
$LineMuted = [System.Drawing.Color]::FromArgb(104, 116, 132)
$LineCard = [System.Drawing.Color]::FromArgb(255, 255, 255)
$LineInkSoft = [System.Drawing.Color]::FromArgb(44, 54, 68)
$IOSGreen = [System.Drawing.Color]::FromArgb(52, 199, 89)
$IOSOrange = [System.Drawing.Color]::FromArgb(255, 149, 0)
$IOSRed = [System.Drawing.Color]::FromArgb(255, 59, 48)

function Set-LineButton {
    param(
        [System.Windows.Forms.Button]$Button,
        [string]$Kind = "Secondary"
    )

    $Button.FlatStyle = "Flat"
    $Button.FlatAppearance.BorderSize = 1
    $Button.Cursor = [System.Windows.Forms.Cursors]::Hand
    $Button.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
    Set-RoundedControl $Button 20

    if ($Kind -eq "Primary") {
        $Button.BackColor = $LineGreen
        $Button.ForeColor = [System.Drawing.Color]::White
        $Button.FlatAppearance.BorderColor = $LineGreen
        $Button.FlatAppearance.MouseOverBackColor = $LineGreenDark
        $Button.FlatAppearance.MouseDownBackColor = $LineGreenDark
    } elseif ($Kind -eq "Danger") {
        $Button.BackColor = [System.Drawing.Color]::FromArgb(255, 242, 241)
        $Button.ForeColor = $IOSRed
        $Button.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(255, 210, 207)
        $Button.FlatAppearance.MouseOverBackColor = [System.Drawing.Color]::FromArgb(255, 231, 229)
        $Button.FlatAppearance.MouseDownBackColor = [System.Drawing.Color]::FromArgb(255, 218, 215)
    } else {
        $Button.BackColor = [System.Drawing.Color]::FromArgb(248, 250, 253)
        $Button.ForeColor = $LineText
        $Button.FlatAppearance.BorderColor = $LineBorder
        $Button.FlatAppearance.MouseOverBackColor = $LineSoft
        $Button.FlatAppearance.MouseDownBackColor = [System.Drawing.Color]::FromArgb(218, 235, 255)
    }
}

function Set-FilterButton {
    param([System.Windows.Forms.Button]$Button)
    Set-LineButton $Button "Secondary"
    $Button.Size = New-Object System.Drawing.Size(92, 38)
}

function Set-LineInput {
    param([System.Windows.Forms.Control]$Control)
    $Control.BackColor = [System.Drawing.Color]::White
    $Control.ForeColor = $LineText
    $Control.Font = New-Object System.Drawing.Font("Segoe UI", 10)
}

function Set-RoundedControl {
    param(
        [System.Windows.Forms.Control]$Control,
        [int]$Radius = 14
    )

    $applyRound = {
        param($target, $roundRadius)
        if ($target.Width -le 0 -or $target.Height -le 0) { return }
        $diameter = [Math]::Min($roundRadius * 2, [Math]::Min($target.Width, $target.Height))
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $path.AddArc(0, 0, $diameter, $diameter, 180, 90)
        $path.AddArc($target.Width - $diameter - 1, 0, $diameter, $diameter, 270, 90)
        $path.AddArc($target.Width - $diameter - 1, $target.Height - $diameter - 1, $diameter, $diameter, 0, 90)
        $path.AddArc(0, $target.Height - $diameter - 1, $diameter, $diameter, 90, 90)
        $path.CloseFigure()
        $target.Region = New-Object System.Drawing.Region($path)
    }

    & $applyRound $Control $Radius
    $resizeHandler = { & $applyRound $this $Radius }.GetNewClosure()
    $Control.Add_Resize($resizeHandler)
}

$Form = New-Object System.Windows.Forms.Form
$Form.Text = "โปรแกรมจัดการงานในมือ"
$Form.StartPosition = "CenterScreen"
$Form.Size = New-Object System.Drawing.Size(1180, 740)
$Form.MinimumSize = New-Object System.Drawing.Size(980, 600)
$Form.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$Form.BackColor = $LineBg

$HeaderPanel = New-Object System.Windows.Forms.Panel
$HeaderPanel.Location = New-Object System.Drawing.Point(22, 20)
$HeaderPanel.Size = New-Object System.Drawing.Size(1120, 104)
$HeaderPanel.Anchor = "Top, Left, Right"
$HeaderPanel.BackColor = [System.Drawing.Color]::FromArgb(252, 253, 255)
Set-RoundedControl $HeaderPanel 30

$AccentPanel = New-Object System.Windows.Forms.Panel
$AccentPanel.Location = New-Object System.Drawing.Point(20, 22)
$AccentPanel.Size = New-Object System.Drawing.Size(6, 60)
$AccentPanel.Anchor = "Top, Bottom, Left"
$AccentPanel.BackColor = $LineGreen
Set-RoundedControl $AccentPanel 3

$LogoLabel = New-Object System.Windows.Forms.Label
$LogoLabel.Text = "✓"
$LogoLabel.Font = New-Object System.Drawing.Font("Segoe UI", 22, [System.Drawing.FontStyle]::Bold)
$LogoLabel.ForeColor = [System.Drawing.Color]::White
$LogoLabel.BackColor = $LineGreen
$LogoLabel.TextAlign = "MiddleCenter"
$LogoLabel.Location = New-Object System.Drawing.Point(42, 24)
$LogoLabel.Size = New-Object System.Drawing.Size(56, 56)
Set-RoundedControl $LogoLabel 28

$TitleLabel = New-Object System.Windows.Forms.Label
$TitleLabel.Text = "งานของคุณ"
$TitleLabel.Font = New-Object System.Drawing.Font("Segoe UI", 24, [System.Drawing.FontStyle]::Bold)
$TitleLabel.Location = New-Object System.Drawing.Point(118, 20)
$TitleLabel.Size = New-Object System.Drawing.Size(360, 42)
$TitleLabel.ForeColor = $LineText
$TitleLabel.BackColor = $HeaderPanel.BackColor

$SummaryLabel = New-Object System.Windows.Forms.Label
$SummaryLabel.Text = "กำลังโหลดข้อมูล"
$SummaryLabel.Location = New-Object System.Drawing.Point(120, 64)
$SummaryLabel.Size = New-Object System.Drawing.Size(780, 24)
$SummaryLabel.ForeColor = $LineMuted
$SummaryLabel.BackColor = $HeaderPanel.BackColor

$ThemeBadge = New-Object System.Windows.Forms.Label
$ThemeBadge.Text = "iOS style"
$ThemeBadge.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$ThemeBadge.ForeColor = $LineGreen
$ThemeBadge.BackColor = $LineSoft
$ThemeBadge.TextAlign = "MiddleCenter"
$ThemeBadge.Location = New-Object System.Drawing.Point(760, 34)
$ThemeBadge.Size = New-Object System.Drawing.Size(90, 30)
$ThemeBadge.Anchor = "Top, Right"
Set-RoundedControl $ThemeBadge 15

$ToolbarPanel = New-Object System.Windows.Forms.Panel
$ToolbarPanel.Location = New-Object System.Drawing.Point(22, 142)
$ToolbarPanel.Size = New-Object System.Drawing.Size(1120, 70)
$ToolbarPanel.Anchor = "Top, Left, Right"
$ToolbarPanel.BackColor = [System.Drawing.Color]::FromArgb(252, 253, 255)
$ToolbarPanel.BorderStyle = "None"
Set-RoundedControl $ToolbarPanel 26

$SearchLabel = New-Object System.Windows.Forms.Label
$SearchLabel.Text = "ค้นหา"
$SearchLabel.Location = New-Object System.Drawing.Point(18, 10)
$SearchLabel.Size = New-Object System.Drawing.Size(48, 20)
$SearchLabel.ForeColor = $LineMuted
$SearchLabel.BackColor = $ToolbarPanel.BackColor

$PriorityLabel = New-Object System.Windows.Forms.Label
$PriorityLabel.Text = "ความสำคัญ"
$PriorityLabel.Location = New-Object System.Drawing.Point(386, 10)
$PriorityLabel.Size = New-Object System.Drawing.Size(110, 20)
$PriorityLabel.ForeColor = $LineMuted
$PriorityLabel.BackColor = $ToolbarPanel.BackColor

$AddButton = New-Object System.Windows.Forms.Button
$AddButton.Text = "+ เพิ่มงาน"
$AddButton.Location = New-Object System.Drawing.Point(882, 34)
$AddButton.Size = New-Object System.Drawing.Size(108, 42)
$AddButton.Anchor = "Top, Right"
Set-LineButton $AddButton "Primary"

$EditButton = New-Object System.Windows.Forms.Button
$EditButton.Text = "แก้ไข"
$EditButton.Location = New-Object System.Drawing.Point(998, 34)
$EditButton.Size = New-Object System.Drawing.Size(92, 42)
$EditButton.Anchor = "Top, Right"
Set-LineButton $EditButton "Secondary"

$SearchBox = New-Object System.Windows.Forms.TextBox
$SearchBox.Location = New-Object System.Drawing.Point(18, 31)
$SearchBox.Size = New-Object System.Drawing.Size(350, 32)
Set-LineInput $SearchBox
Set-RoundedControl $SearchBox 14

$PriorityFilter = New-Object System.Windows.Forms.ComboBox
$PriorityFilter.Location = New-Object System.Drawing.Point(386, 31)
$PriorityFilter.Size = New-Object System.Drawing.Size(142, 32)
$PriorityFilter.DropDownStyle = "DropDownList"
[void]$PriorityFilter.Items.AddRange(@("ทั้งหมด", "สูง", "กลาง", "ต่ำ"))
$PriorityFilter.SelectedIndex = 0
Set-LineInput $PriorityFilter

$AllButton = New-Object System.Windows.Forms.Button
$AllButton.Text = "ทั้งหมด"
$AllButton.Location = New-Object System.Drawing.Point(548, 22)
Set-FilterButton $AllButton

$TodoButton = New-Object System.Windows.Forms.Button
$TodoButton.Text = "รอทำ"
$TodoButton.Location = New-Object System.Drawing.Point(646, 22)
Set-FilterButton $TodoButton

$DoingButton = New-Object System.Windows.Forms.Button
$DoingButton.Text = "กำลังทำ"
$DoingButton.Location = New-Object System.Drawing.Point(744, 22)
Set-FilterButton $DoingButton

$DoneButton = New-Object System.Windows.Forms.Button
$DoneButton.Text = "เสร็จแล้ว"
$DoneButton.Location = New-Object System.Drawing.Point(842, 22)
Set-FilterButton $DoneButton

$Grid = New-Object System.Windows.Forms.DataGridView
$Grid.Location = New-Object System.Drawing.Point(22, 232)
$Grid.Size = New-Object System.Drawing.Size(1120, 376)
$Grid.Anchor = "Top, Bottom, Left, Right"
$Grid.AllowUserToAddRows = $false
$Grid.AllowUserToDeleteRows = $false
$Grid.ReadOnly = $true
$Grid.SelectionMode = "FullRowSelect"
$Grid.MultiSelect = $false
$Grid.AutoSizeColumnsMode = "Fill"
$Grid.RowHeadersVisible = $false
$Grid.BackgroundColor = [System.Drawing.Color]::White
$Grid.BorderStyle = "None"
$Grid.CellBorderStyle = "SingleHorizontal"
$Grid.GridColor = [System.Drawing.Color]::FromArgb(232, 236, 242)
$Grid.EnableHeadersVisualStyles = $false
$Grid.ColumnHeadersDefaultCellStyle.BackColor = [System.Drawing.Color]::FromArgb(246, 248, 252)
$Grid.ColumnHeadersDefaultCellStyle.ForeColor = $LineText
$Grid.ColumnHeadersDefaultCellStyle.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$Grid.ColumnHeadersHeight = 42
$Grid.RowTemplate.Height = 42
$Grid.DefaultCellStyle.BackColor = [System.Drawing.Color]::White
$Grid.DefaultCellStyle.ForeColor = $LineText
$Grid.DefaultCellStyle.SelectionBackColor = [System.Drawing.Color]::FromArgb(219, 237, 255)
$Grid.DefaultCellStyle.SelectionForeColor = $LineText
$Grid.AlternatingRowsDefaultCellStyle.BackColor = [System.Drawing.Color]::FromArgb(250, 252, 250)
Set-RoundedControl $Grid 24

[void]$Grid.Columns.Add("Id", "Id")
$Grid.Columns["Id"].Visible = $false
[void]$Grid.Columns.Add("Title", "ชื่องาน")
[void]$Grid.Columns.Add("Owner", "ผู้รับผิดชอบ")
[void]$Grid.Columns.Add("Priority", "ความสำคัญ")
[void]$Grid.Columns.Add("Status", "สถานะ")
[void]$Grid.Columns.Add("DueDate", "กำหนดส่ง")
[void]$Grid.Columns.Add("ReminderAt", "แจ้งเตือน")
[void]$Grid.Columns.Add("Note", "หมายเหตุ")
$Grid.Columns["Title"].FillWeight = 180
$Grid.Columns["Owner"].FillWeight = 90
$Grid.Columns["Priority"].FillWeight = 70
$Grid.Columns["Status"].FillWeight = 80
$Grid.Columns["DueDate"].FillWeight = 80
$Grid.Columns["ReminderAt"].FillWeight = 95
$Grid.Columns["Note"].FillWeight = 155

$FooterPanel = New-Object System.Windows.Forms.Panel
$FooterPanel.Location = New-Object System.Drawing.Point(22, 624)
$FooterPanel.Size = New-Object System.Drawing.Size(1120, 58)
$FooterPanel.Anchor = "Bottom, Left, Right"
$FooterPanel.BackColor = $LineCard
$FooterPanel.BorderStyle = "None"
Set-RoundedControl $FooterPanel 18

$MarkDoingButton = New-Object System.Windows.Forms.Button
$MarkDoingButton.Text = "กำลังทำ"
$MarkDoingButton.Location = New-Object System.Drawing.Point(14, 10)
$MarkDoingButton.Size = New-Object System.Drawing.Size(140, 38)
$MarkDoingButton.Anchor = "Bottom, Left"
Set-LineButton $MarkDoingButton "Secondary"

$MarkDoneButton = New-Object System.Windows.Forms.Button
$MarkDoneButton.Text = "ปิดงาน"
$MarkDoneButton.Location = New-Object System.Drawing.Point(162, 10)
$MarkDoneButton.Size = New-Object System.Drawing.Size(100, 38)
$MarkDoneButton.Anchor = "Bottom, Left"
Set-LineButton $MarkDoneButton "Primary"

$DeleteButton = New-Object System.Windows.Forms.Button
$DeleteButton.Text = "ลบงาน"
$DeleteButton.Location = New-Object System.Drawing.Point(270, 10)
$DeleteButton.Size = New-Object System.Drawing.Size(100, 38)
$DeleteButton.Anchor = "Bottom, Left"
Set-LineButton $DeleteButton "Danger"

$TestReminderButton = New-Object System.Windows.Forms.Button
$TestReminderButton.Text = "ทดสอบแจ้งเตือน"
$TestReminderButton.Location = New-Object System.Drawing.Point(378, 10)
$TestReminderButton.Size = New-Object System.Drawing.Size(140, 38)
$TestReminderButton.Anchor = "Bottom, Left"
Set-LineButton $TestReminderButton "Secondary"

$OpenFolderButton = New-Object System.Windows.Forms.Button
$OpenFolderButton.Text = "เปิดโฟลเดอร์ข้อมูล"
$OpenFolderButton.Location = New-Object System.Drawing.Point(940, 10)
$OpenFolderButton.Size = New-Object System.Drawing.Size(164, 38)
$OpenFolderButton.Anchor = "Bottom, Right"
Set-LineButton $OpenFolderButton "Secondary"

$HeaderPanel.Controls.AddRange(@($AccentPanel, $LogoLabel, $TitleLabel, $SummaryLabel, $ThemeBadge, $AddButton, $EditButton))
$ToolbarPanel.Controls.AddRange(@($SearchLabel, $SearchBox, $PriorityLabel, $PriorityFilter, $AllButton, $TodoButton, $DoingButton, $DoneButton))
$FooterPanel.Controls.AddRange(@($MarkDoingButton, $MarkDoneButton, $DeleteButton, $TestReminderButton, $OpenFolderButton))
$Form.Controls.AddRange(@($HeaderPanel, $ToolbarPanel, $Grid, $FooterPanel))

$AddButton.Add_Click({ Show-TaskDialog })
$EditButton.Add_Click({
    $task = Get-SelectedTask
    if ($null -eq $task) {
        [System.Windows.Forms.MessageBox]::Show("กรุณาเลือกงานก่อน", "ยังไม่ได้เลือกงาน", "OK", "Information") | Out-Null
        return
    }
    Show-TaskDialog -Task $task
})
$Grid.Add_CellDoubleClick({
    $task = Get-SelectedTask
    if ($null -ne $task) {
        Show-TaskDialog -Task $task
    }
})
$SearchBox.Add_TextChanged({ Refresh-Grid })
$PriorityFilter.Add_SelectedIndexChanged({ Refresh-Grid })

$AllButton.Add_Click({ $script:CurrentFilter = "ทั้งหมด"; Refresh-Grid })
$TodoButton.Add_Click({ $script:CurrentFilter = "รอทำ"; Refresh-Grid })
$DoingButton.Add_Click({ $script:CurrentFilter = "กำลังทำ"; Refresh-Grid })
$DoneButton.Add_Click({ $script:CurrentFilter = "เสร็จแล้ว"; Refresh-Grid })

$MarkDoingButton.Add_Click({
    $task = Get-SelectedTask
    if ($null -eq $task) { return }
    $task.Status = "กำลังทำ"
    $task.UpdatedAt = (Get-Date).ToString("s")
    Save-Tasks
    Refresh-Grid
})

$MarkDoneButton.Add_Click({
    $task = Get-SelectedTask
    if ($null -eq $task) { return }
    $task.Status = "เสร็จแล้ว"
    $task.UpdatedAt = (Get-Date).ToString("s")
    Save-Tasks
    Refresh-Grid
})

$DeleteButton.Add_Click({
    $task = Get-SelectedTask
    if ($null -eq $task) { return }
    $answer = [System.Windows.Forms.MessageBox]::Show("ต้องการลบงานนี้ใช่ไหม", "ยืนยันการลบ", "YesNo", "Question")
    if ($answer -ne [System.Windows.Forms.DialogResult]::Yes) { return }
    $script:Tasks = @($script:Tasks | Where-Object { $_.Id -ne $task.Id })
    Save-Tasks
    Refresh-Grid
})

$TestReminderButton.Add_Click({
    $task = Get-SelectedTask
    if ($null -eq $task) {
        [System.Windows.Forms.MessageBox]::Show("กรุณาเลือกงานก่อน", "ยังไม่ได้เลือกงาน", "OK", "Information") | Out-Null
        return
    }
    [System.Windows.Forms.MessageBox]::Show($Form, "ตัวอย่างแจ้งเตือนงาน:`r`n`r`n$($task.Title)", "ทดสอบแจ้งเตือน", "OK", "Information") | Out-Null
})

$OpenFolderButton.Add_Click({
    Start-Process explorer.exe $AppDir
})

Load-Tasks
Refresh-Grid

$ReminderTimer = New-Object System.Windows.Forms.Timer
$ReminderTimer.Interval = 30000
$ReminderTimer.Add_Tick({ Check-Reminders })
$ReminderTimer.Start()
$Form.Add_Shown({ Check-Reminders })
$Form.Add_FormClosed({ $ReminderTimer.Stop(); $ReminderTimer.Dispose() })

[void][System.Windows.Forms.Application]::Run($Form)
