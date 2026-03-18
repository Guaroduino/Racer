(Get-Content style.css) -replace "flex-direction: column;`r`n    margin: 0;", "flex-direction: row;`r`n    margin: 0;" | Set-Content style.css
