export const cases = [
  { id: 'printf', source: '#include <stdio.h>\nint main(void){printf("hello %d\\n",42);return 0;}', expected: 'hello 42\n' },
  { id: 'scanf', stdin: '17 lab\n', source: '#include <stdio.h>\nint main(void){int n;char s[16];if(scanf("%d %15s",&n,s)!=2)return 1;printf("%d %s\\n",n+1,s);return 0;}', expected: '18 lab\n' },
  { id: 'loops-functions-arrays', source: '#include <stdio.h>\nint sum(const int *a,int n){int s=0;for(int i=0;i<n;i++)s+=a[i];return s;}\nint main(void){int a[]={2,4,6};int n=0;while(n<3)n++;do{n--;}while(n>3);printf("%d %d\\n",sum(a,3),n);return 0;}', expected: '12 2\n' },
  { id: 'strings-pointers-struct', source: '#include <stdio.h>\n#include <string.h>\nstruct Item{int value;char name[16];};\nint main(void){struct Item a={7,"pocket"};struct Item *p=&a;char b[32];strcpy(b,p->name);strcat(b," C");p->value+=2;printf("%s %d %lu\\n",b,a.value,(unsigned long)strlen(b));return 0;}', expected: 'pocket C 9 8\n' },
  { id: 'malloc-free', source: '#include <stdio.h>\n#include <stdlib.h>\nint main(void){for(int k=0;k<32;k++){int *p=malloc(256*sizeof *p);if(!p)return 1;for(int i=0;i<256;i++)p[i]=i;if(p[255]!=255)return 2;free(p);}printf("alloc ok\\n");return 0;}', expected: 'alloc ok\n' },
  { id: 'files', source: '#include <stdio.h>\n#include <string.h>\nint main(void){FILE *f=fopen("data.txt","w");if(!f)return 1;if(fprintf(f,"%d %s\\n",73,"pocket")!=10)return 2;if(fclose(f))return 3;f=fopen("data.txt","r");if(!f)return 4;int n=0;char s[16];if(fscanf(f,"%d %15s",&n,s)!=2)return 5;if(fclose(f))return 6;if(n!=73||strcmp(s,"pocket"))return 7;printf("%d %s\\n",n,s);return 0;}', expected: '73 pocket\n', files: { 'data.txt': '73 pocket\n' } },
  { id: 'scanf-eof', stdin: '', source: '#include <stdio.h>\nint main(void){int n;printf("%d\\n",scanf("%d",&n)==EOF);return 0;}', expected: '1\n' },
  { id: 'compile-error', source: 'int main(void){ this is invalid C; }', compileError: true },
  { id: 'exit-status', source: 'int main(void){return 7;}', expected: '', exitCode: 7 },
  { id: 'timeout', source: 'int main(void){volatile unsigned int n=0;for(;;)n++;}', timeout: true }
];
