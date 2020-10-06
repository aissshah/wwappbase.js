#!/bin/bash
# Record git status and log into a manifest file, to help in debugging
# Use-case: This shows what code the server is running

LOGFILE='web/build/gitlog.txt'
printf "HOST:\t$HOSTNAME\n"
printf "## $(PWD)\n" > $LOGFILE
printf "$(git status)\n" >> $LOGFILE 
printf "$(git log -1)\n" >> $LOGFILE 
printf "---------------\n" >> $LOGFILE 
printf '## wwappbase.js\n' >> $LOGFILE
printf "branch\n" >> $LOGFILE 
# NB: status doesn't work with git-dir, so use branch
git --git-dir ../wwappbase.js/.git branch >> $LOGFILE 
git --git-dir ../wwappbase.js/.git log -1 >> $LOGFILE

printf "Wrote git manifest: $LOGFILE\n"
