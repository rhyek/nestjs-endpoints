<!--
  The word "endpoint" where a page sets a nestjs-endpoints endpoint against a NestJS controller,
  or says what one is: `An <Endpoint>endpoint</Endpoint> is a controller class`. The word is the
  component's content, so the Markdown copy of a page (llms.txt) keeps it when the tag is removed.
  Not for every mention: a page that only tells how to write one leaves the word plain.

  Where a component can't be written (a string in a page's frontmatter), the same look is
  `<span class="endpoint-term">`.
-->
<template>
  <span class="endpoint-term"><slot /></span>
</template>
