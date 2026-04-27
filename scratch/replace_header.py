import os

file_path = '/Users/tsaisungen/Sites/GroupTrip/src/components/ItineraryPlanner.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_header = [
    '                        <div className="flex items-center gap-3 mb-4 p-1">\n',
    '                          <div className="flex items-center gap-2">\n',
    '                             <Users className={cn("w-4 h-4", newItem.isMain ? "text-red-500" : "text-stone-900")} />\n',
    '                             <h4 className={cn(\n',
    '                               "text-sm font-serif font-black tracking-tight transition-all duration-500 whitespace-nowrap",\n',
    '                               newItem.isMain ? "text-red-600 scale-100" : "text-stone-900"\n',
    '                             )}>\n',
    '                               {newItem.isMain ? \'排除不參加人員\' : \'指派參與人員\'}\n',
    '                             </h4>\n',
    '                             <span className={cn(\n',
    '                               "text-[9px] font-black uppercase tracking-[0.2em] font-serif italic whitespace-nowrap ml-1 opacity-60",\n',
    '                               newItem.isMain ? "text-red-400" : "text-stone-400"\n',
    '                             )}>\n',
    '                               {newItem.isMain ? \'Exclude Non-participants\' : \'Assign Participants\'}\n',
    '                             </span>\n',
    '                          </div>\n',
    '                          \n',
    '                          <div className={cn(\n',
    '                            "h-px flex-1 rounded-full",\n',
    '                            newItem.isMain ? "bg-red-100" : "bg-stone-100"\n',
    '                          )} />\n',
    '                          \n',
    '                          <span className={cn(\n',
    '                            "px-2 py-0.5 rounded-full text-[9px] font-black shadow-sm transition-all duration-500 whitespace-nowrap",\n',
    '                            newItem.isMain ? "bg-red-500 text-white" : "bg-stone-900 text-white"\n',
    '                          )}>\n',
    '                            {selectedMembers.length} 人\n',
    '                          </span>\n',
    '                        </div>\n'
]

# We are replacing from line 1090 to 1115 (1-indexed)
# In 0-indexed list, that is lines[1089:1115]
# Wait, let's check current line count from view_file.
# Line 1090 starts the div. Line 1115 ends the div.
# So indices 1089 through 1114.

lines[1089:1115] = new_header

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Successfully updated header.")
